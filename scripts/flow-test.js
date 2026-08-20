// ============================================================
// CRICKET DUEL — End-to-end flow test
// Spawns the server on a test port, connects two fake players,
// plays a full 2-over match, and verifies:
//   1. Match completes and a scorecard is produced
//   2. Hidden information is isolated (batsman never sees the
//      bowler's delivery options, and vice versa)
//   3. Server rejects decisions from the wrong role
//   4. The decision timer auto-picks a conservative choice
//
// Run: node scripts/flow-test.js
// ============================================================

const { spawn } = require('child_process');
const { io } = require('../client/node_modules/socket.io-client');

const PORT = 3999;
const TEST_TIMEOUT_MS = 180000;

const server = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let serverLog = '';
server.stderr.on('data', d => { serverLog += d.toString(); });

const wait = ms => new Promise(r => setTimeout(r, ms));

function connect() {
  return new Promise((resolve, reject) => {
    const s = io(`http://localhost:${PORT}`, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 5000,
    });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

function emitAck(socket, event, ...args) {
  return new Promise(resolve => socket.emit(event, ...args, resolve));
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), ms)),
  ]);
}

function waitFor(socket, event, ms = 10000) {
  return withTimeout(new Promise(resolve => socket.once(event, resolve)), ms, event);
}

const failures = [];
function assert(cond, label) {
  if (cond) {
    console.log(`  ✅ ${label}`);
  } else {
    failures.push(label);
    console.log(`  ❌ ${label}`);
  }
}

(async () => {
  try {
    await wait(1500);

    const host = await connect();
    const guest = await connect();
    console.log('Connected both players');

    // --- Create + join ---
    const created = await emitAck(host, 'create_game', { totalOvers: 2 });
    assert(created.success, 'host creates game');
    const matchCode = created.matchCode;

    const playerJoinedP = waitFor(host, 'player_joined');
    const joined = await emitAck(guest, 'join_game', matchCode);
    assert(joined.success, 'guest joins game');
    await playerJoinedP;

    // --- Toss ---
    const tossStartedP = Promise.all([waitFor(host, 'toss_started'), waitFor(guest, 'toss_started')]);
    await emitAck(host, 'start_toss', matchCode);
    await tossStartedP;

    const tossResultP = waitFor(host, 'toss_result');
    await emitAck(host, 'call_toss', matchCode, 'heads');
    const tossRes = await tossResultP;
    const winnerSocket = tossRes.winnerSocketId === host.id ? host : guest;

    // --- Role tracking: match_state tells each player their role ---
    const roles = { host: null, guest: null };
    const setRole = (sock, data) => {
      const key = sock === host ? 'host' : 'guest';
      roles[key] = data.yourTeamIndex === data.battingTeamIndex ? 'batting' : 'bowling';
    };

    // --- Event listeners / auto-responders ---
    const stats = {
      host: { bowlingData: 0, battingData: 0, waiting: 0, balls: [], completed: null, pendingBowlerSelect: false, everSawMatchState: false },
      guest: { bowlingData: 0, battingData: 0, waiting: 0, balls: [], completed: null, pendingBowlerSelect: false, everSawMatchState: false },
    };
    let pausedBowler = false;   // timer test: skip one bowler response
    let pauseTime = null;
    let rejectionTested = false;

    const wire = (sock) => {
      const key = sock === host ? 'host' : 'guest';
      const st = stats[key];

    // Pick a bowler who still has overs left (server enforces the limit)
    const selectBowler = (sock) => {
      sock.emit('get_bowling_options', matchCode, (res) => {
        if (res.success && res.bowlers.length > 0) {
          const pick = res.bowlers.find(b => !b.exhausted) || res.bowlers[0];
          sock.emit('select_bowler', matchCode, pick.index);
        }
      });
    };

    // The bowling captain must pick a bowler at match start, after each new
    // over, and after the innings break. match_state carries the role info.
    sock.on('match_state', (data) => {
      setRole(sock, data);
      if (!st.everSawMatchState) st.pendingBowlerSelect = true;
      st.everSawMatchState = true;
      if (roles[key] === 'bowling' && st.pendingBowlerSelect) {
        st.pendingBowlerSelect = false;
        selectBowler(sock);
      }

      // Fielding test (once, when this player is the bowling captain AND the
      // innings has started — the roster is only populated after the bowler
      // is selected, which calls autoAssignFielders).
      const rosterSize = Object.keys(data.fielderRoster || {}).length;
      if (!st.fieldTested && roles[key] === 'bowling' && rosterSize === 11) {
        st.fieldTested = true;
        assert(true, 'match_state carries a full fielding roster (11)');
        sock.once('field_changed', (fc) => {
          st.fieldChanged = fc;
          assert(!!fc?.fielderRoster && Object.keys(fc.fielderRoster).length === 11, 'field_changed carries the roster');
        });
        // Valid: slip → gully (both off side — stays legal)
        sock.emit('move_fielder', matchCode, 'slip', 'gully', (res) => {
          if (!res?.success) console.log('  ⓘ move_fielder rejected:', res?.error);
          assert(res?.success, 'captain moves a fielder (slip → gully)');
          // Illegal: point → deep_square adds a 6th leg-side fielder
          sock.emit('move_fielder', matchCode, 'point', 'deep_square', (res2) => {
            assert(!res2?.success && /ILLEGAL/.test(res2?.error || ''), 'illegal field move rejected with explanation');
          });
        });
      }
    });

    sock.on('new_over', () => {
      st.pendingBowlerSelect = true;
      // Over-limit test: after the first over, try to re-select the exhausted bowler
      if (!st.limitTested) {
        st.limitTested = true;
        sock.emit('get_bowling_options', matchCode, (res) => {
          const exhausted = res.bowlers.find(b => b.exhausted);
          if (exhausted) {
            sock.emit('select_bowler', matchCode, exhausted.index, (resp) => {
              assert(!resp.success, 'server rejects a bowler over their over limit');
            });
          }
        });
      }
    });
    sock.on('innings_break', () => { st.pendingBowlerSelect = true; });

      sock.on('bowler_choose_delivery', (data) => {
        st.bowlingData++;
        // Hidden-info check: must never arrive while this player is batting
        if (roles[key] === 'batting') {
          failures.push(`hidden info leak: ${key} saw delivery options while batting`);
        }

        // Role rejection test (once, innings 1): the batting player tries to bowl
        if (!rejectionTested) {
          rejectionTested = true;
          const battingSock = roles.host === 'batting' ? host : guest;
          emitAck(battingSock, 'choose_delivery', matchCode, data.options[0]).then(res => {
            assert(!res.success, 'server rejects delivery choice from the batting player');
          });
        }

        // Timer test: pause the bowler once, expect the server to auto-pick
        if (!pausedBowler) {
          pausedBowler = true;
          pauseTime = Date.now();
          return; // do NOT respond — server timer should auto-pick
        }
        sock.emit('choose_delivery', matchCode, data.options[0]);
      });

      sock.on('batsman_choose_shot', (data) => {
        st.battingData++;
        if (roles[key] === 'bowling') {
          failures.push(`hidden info leak: ${key} saw shot options while bowling`);
        }
        sock.emit('choose_shot', matchCode, data.options[0]);
      });

      sock.on('waiting_for', () => { st.waiting++; });

      sock.on('ball_result', (data) => {
        // Wides/no-balls are extras, not legal balls — don't count them
        if (!data.outcome?.isWide && !data.outcome?.isNoBall) st.balls.push(Date.now());
      });

      sock.on('match_completed', (data) => { st.completed = data; });
    };

    wire(host);
    wire(guest);

    // --- Toss decision (winner bats) ---
    await emitAck(winnerSocket, 'toss_decision', matchCode, 'bat');

    // --- Play until the match completes ---
    await withTimeout(new Promise((resolve) => {
      host.once('match_completed', resolve);
    }), TEST_TIMEOUT_MS, 'match completion').catch(async (e) => {
      // Debug: dump event counts and roles before failing
      console.log('\n--- DEBUG (stalled) ---');
      console.log('roles:', roles);
      console.log('stats.host:', JSON.stringify({ ...stats.host, balls: stats.host.balls.length }));
      console.log('stats.guest:', JSON.stringify({ ...stats.guest, balls: stats.guest.balls.length }));
      console.log('pausedBowler:', pausedBowler, 'pauseTime:', pauseTime, 'rejectionTested:', rejectionTested);
      if (serverLog) console.log('\n--- SERVER STDERR ---\n' + serverLog);
      throw e;
    });

    const result = stats.host.completed;
    assert(!!result, 'match_completed received');
    assert(!!result?.scorecard?.team1 && !!result?.scorecard?.team2, 'scorecard has both teams');
    assert(!!result?.result, 'winner determined');
    assert(Array.isArray(result?.timeline) && result.timeline.length > 0, 'match timeline included');

    const totalBalls = stats.host.balls.length;
    const totalGuestBalls = stats.guest.balls.length;
    console.log(`  ℹ️  ${totalBalls} ball results received by host, ${totalGuestBalls} by guest`);
    assert(totalBalls === totalGuestBalls, 'both players receive every ball result');
    assert(totalBalls > 0 && totalBalls <= 24, `ball count in range (got ${totalBalls})`);

    // --- Hidden info isolation ---
    // Over a full match each player bowls one innings and bats one innings,
    // so both should have seen their OWN role's data at least once...
    assert(stats.host.bowlingData > 0 && stats.host.battingData > 0, 'host played both roles across innings');
    assert(stats.guest.bowlingData > 0 && stats.guest.battingData > 0, 'guest played both roles across innings');
    assert(stats.host.waiting > 0 && stats.guest.waiting > 0, 'both players saw waiting states');

    // --- Field editing ---
    assert((stats.host.fieldTested || stats.guest.fieldTested), 'field-editing flow exercised');
    assert((stats.host.fieldChanged || stats.guest.fieldChanged), 'field_changed broadcast after a move');

    // ...but never the other role's data. Verified via the leak checks in wire().
    assert(failures.filter(f => f.includes('hidden info leak')).length === 0, 'no hidden information leaked');

    // --- Timer auto-pick ---
    assert(pauseTime !== null, 'timer test triggered');
    // The pause happens on the first delivery, so the ~15s delay shows up as
    // either a late first ball result or a gap between consecutive results.
    const firstBallLate = stats.host.balls.length > 0 && stats.host.balls[0] - pauseTime > 10000;
    const gap = stats.host.balls.find((t, i) => i > 0 && t - stats.host.balls[i - 1] > 10000);
    assert(firstBallLate || !!gap, 'decision timer auto-picked a delivery (~15s gap)');

    if (failures.length === 0) {
      console.log('\n🎉 ALL FLOW TESTS PASSED');
    } else {
      console.log(`\n⚠️  ${failures.length} FAILURE(S):`);
      failures.forEach(f => console.log('  - ' + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error('\n💥 TEST ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    server.kill();
    process.exit();
  }
})();
