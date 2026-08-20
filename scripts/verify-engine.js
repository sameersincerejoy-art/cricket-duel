// ============================================================
// CRICKET DUEL — Engine verification
// Tests the pure engine without the server:
//   1. Every field preset satisfies cricket's fielding laws
//   2. No-balls/wides score correctly (extras + batted runs, no wicket)
//   3. Bowler over limits are computed and tracked
//   4. Delivery options are 3 distinct, bowler-appropriate choices
//   5. Shot options are 3 distinct with a defensive option
//   6. A full 2-over innings is exactly 12 legal balls (no early finish)
//
// Run: node scripts/verify-engine.js
// ============================================================

const { MatchEngine } = require('../engine/gameEngine');
const { generateAutoTeam } = require('../engine/autoTeam');
const {
  FIELD_PRESETS,
  validateField,
  calculateOutcome,
  generateDeliveryOptions,
  generateShotOptions,
  DELIVERY_TYPES,
  LINES,
  SHOT_TYPES,
} = require('../engine/cricketEngine');

let pass = 0;
let fail = 0;
function assert(cond, label) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    console.log(`  ❌ ${label}`);
  }
}

// ---------- 1. Field legality ----------
console.log('\n[1] Field legality');
let presetsOk = true;
for (const [key, preset] of Object.entries(FIELD_PRESETS)) {
  const issues = validateField(preset.positions);
  if (issues.length > 0) {
    presetsOk = false;
    console.log(`     ${key}: ${issues.join(' • ')}`);
  }
}
assert(presetsOk, 'every preset is a legal field');
const illegal = validateField(['short_leg', 'leg_gully', 'square_leg', 'midwicket', 'deep_midwicket', 'deep_square', 'fine_leg', 'fine_leg_deep', 'mid_on', 'cover', 'point']);
assert(illegal.length > 0, 'a 9-on-the-leg-side field is rejected');

// ---------- 2. No-ball & wide scoring ----------
console.log('\n[2] No-ball and wide rules');
const sharedNames = new Set();
const teams = [generateAutoTeam(0, 72, sharedNames), generateAutoTeam(1, 72, sharedNames)];
const bowler = teams[1].players.find(p => p.canBowl);
const batsman = teams[0].players[0];
const fielderIds = FIELD_PRESETS.balanced.positions;

// Force the no-ball branch (noBallChance ~0.03) via Math.random stub
const realRandom = Math.random;
let randCalls = 0;
Math.random = () => (randCalls++ === 0 ? 0.001 : realRandom());
const nb = calculateOutcome(
  { type: 'good_length', line: 'stumps', speed: 'fast' },
  { type: 'lofted_drive', power: 95 },
  bowler, batsman, fielderIds, { confidence: 70, pressure: 0 }
);
Math.random = realRandom;
assert(nb.isNoBall === true, 'no-ball detected');
assert(nb.extraRuns === 1, 'no-ball carries 1 extra run');
assert(nb.wicket === false, 'batsman cannot be out off a no-ball');

// Wide
const w = calculateOutcome(
  { type: 'good_length', line: 'wide', speed: 'fast' },
  { type: 'cover_drive', power: 60 },
  bowler, batsman, fielderIds, { confidence: 70, pressure: 0 }
);
assert(w.isWide === true && w.runs === 0 && w.extraRuns === 1, 'wide is 1 extra, no batted runs');

// ---------- 3. Over limits ----------
console.log('\n[3] Bowler over limits');
const engine = new MatchEngine({ matchId: 'T', totalOvers: 2, teams });
assert(engine.getBowlerMaxOvers() === 1, '2-over match → max 1 over per bowler');
const e10 = new MatchEngine({ matchId: 'T', totalOvers: 10, teams });
assert(e10.getBowlerMaxOvers() === 4, '10-over match → max 4 overs per bowler');

// ---------- 4. Delivery options ----------
console.log('\n[4] Delivery option generation');
const paceBowler = teams[1].players.find(p => p.canBowl && p.type !== 'spin' && p.type !== 'leg_spin' && p.type !== 'off_spin') || teams[1].players.find(p => p.canBowl);
const spinBowler = teams[1].players.find(p => p.type === 'spin' || p.type === 'leg_spin' || p.type === 'off_spin');

let allDistinct = true;
let allValid = true;
for (let i = 0; i < 50; i++) {
  const opts = generateDeliveryOptions(paceBowler, {});
  if (opts.length !== 3) allDistinct = false;
  const keys = opts.map(o => `${o.type}|${o.line}`);
  if (new Set(keys).size !== 3) allDistinct = false;
  for (const o of opts) {
    if (!DELIVERY_TYPES[o.type] || !LINES[o.line]) allValid = false;
  }
}
assert(allDistinct, 'pace bowler always gets 3 DISTINCT delivery options');
assert(allValid, 'all generated deliveries reference valid types/lines');

if (spinBowler) {
  // Spin bowlers must never receive pace-only delivery types (the bowler
  // type's library decides what they can bowl).
  const PACE_ONLY = ['yorker','wide_yorker','bouncer','slower_ball','slower_yorker','knuckle_ball','leg_cutter','off_cutter','reverse_swing','short'];
  let spinOk = true;
  for (let i = 0; i < 30; i++) {
    const opts = generateDeliveryOptions(spinBowler, {});
    if (opts.some(o => PACE_ONLY.includes(o.type))) spinOk = false;
  }
  assert(spinOk, 'spinner never receives pace-only deliveries');
} else {
  console.log('     (no spinner in team — skipped)');
}

// ---------- 5. Shot options (delivery-aware cricketing logic) ----------
console.log('\n[5] Shot option generation');
// Pick a capable batsman (opener with strong short-ball/technique)
const shotBatsman = teams[0].players.reduce((a, b) =>
  (b.shortBall || 0) + (b.technique || 0) > (a.shortBall || 0) + (a.technique || 0) ? b : a
);

let shotsOk = true;
for (let i = 0; i < 50; i++) {
  const opts = generateShotOptions(shotBatsman, { type: 'good_length', line: 'stumps' });
  if (opts.length !== 3) shotsOk = false;
  const types = opts.map(o => o.type);
  if (new Set(types).size !== 3) shotsOk = false;
  const hasDefensive = types.some(t => SHOT_TYPES[t] && SHOT_TYPES[t].category === 'defensive');
  if (!hasDefensive) shotsOk = false;
}
assert(shotsOk, 'batsman always gets 3 distinct shots incl. a defensive option');

// Yorkers: forward defence is ALWAYS offered; pull/hook may appear as the
// trap (the mistake slot — worst matchup, high power = tempting)
let yorkerOk = true;
for (let i = 0; i < 30; i++) {
  const opts = generateShotOptions(shotBatsman, { type: 'yorker', line: 'stumps' });
  const types = opts.map(o => o.type);
  if (!types.includes('forward_defence')) yorkerOk = false;
  // The attacking counter (straight_drive/flick) should always be present
  if (!types.some(t => ['straight_drive', 'flick', 'cover_drive'].includes(t))) yorkerOk = false;
}
assert(yorkerOk, 'yorker → forward defence + attacking counter always offered');

// Short balls: back-foot defence + pull/cut, never front-foot drives
let shortOk = true;
for (let i = 0; i < 30; i++) {
  const opts = generateShotOptions(shotBatsman, { type: 'short', line: 'stumps' });
  const types = opts.map(o => o.type);
  if (!types.includes('back_foot_defence')) shortOk = false;
  if (types.some(t => ['cover_drive', 'straight_drive', 'on_drive'].includes(t))) shortOk = false;
}
assert(shortOk, 'short ball → back-foot defence, never front-foot drives');

// Spin: sweep/paddle appear against leg spin
let spinOk = true;
for (let i = 0; i < 30; i++) {
  const opts = generateShotOptions(shotBatsman, { type: 'leg_break', line: 'stumps' });
  const types = opts.map(o => o.type);
  if (!types.some(t => ['sweep', 'paddle'].includes(t))) spinOk = false;
}
assert(spinOk, 'leg break → sweep/paddle offered');

// Full toss: forward defence + a driving counter always offered
let fullTossOk = true;
for (let i = 0; i < 30; i++) {
  const opts = generateShotOptions(shotBatsman, { type: 'full_tos', line: 'stumps' });
  const types = opts.map(o => o.type);
  // Defence offered
  if (!types.includes('forward_defence')) fullTossOk = false;
  // Driving / attacking counter offered (the decent slot)
  if (!types.some(t => ['cover_drive', 'straight_drive', 'on_drive', 'lofted_drive', 'lofted_straight', 'scoop'].includes(t))) fullTossOk = false;
}
assert(fullTossOk, 'full toss → forward defence + attacking/driving counter always offered');

// Leave: only offered against outside-off lines
let leaveOk = true;
let leaveSeen = false;
for (let i = 0; i < 20; i++) {
  const opts = generateShotOptions(shotBatsman, { type: 'wide_yorker', line: 'wide_off' });
  if (opts.some(o => o.type === 'leave')) leaveSeen = true;
}
for (let i = 0; i < 20; i++) {
  const opts = generateShotOptions(shotBatsman, { type: 'yorker', line: 'stumps' });
  if (opts.some(o => o.type === 'leave')) leaveOk = false;
}
assert(leaveSeen && leaveOk, 'leave offered outside-off only, never on the stumps');

// ---------- 6. Fielding: roster, movement, influence ----------
console.log('\n[6] Fielding — roster, movement, influence');
const fe = new MatchEngine({ matchId: 'F', totalOvers: 2, teams });
fe.currentFieldPreset = 'balanced';
fe.currentFielders = FIELD_PRESETS.balanced.positions;

assert(fe.autoAssignFielders(1) === true, 'auto-assigns 11 fielders to 11 positions');
assert(Object.keys(fe.fielderByPosition).length === 11, 'roster has 11 positions');

const fieldScore = (p) => (p.fielding?.catching ?? 60) + (p.fielding?.reflex ?? 60) + (p.fielding?.groundFielding ?? 60);
const slipScore = fieldScore(fe.fielderByPosition.slip || {});
const bestFieldScore = Math.max(...teams[1].players.map(fieldScore));
assert(slipScore === bestFieldScore, 'best all-round fielder takes slip');

// Manual moves persist across balls (setBowler must not reset them)
fe.setFielderPosition('slip', 'gully');
const afterMove = [...fe.currentFielders];
assert(!fe.currentFielders.includes('slip') && fe.currentFielders.includes('gully'), 'fielder moved slip → gully');
assert(fe.fielderByPosition.gully?.name, 'roster follows the moved fielder');
fe.setBowler(teams[1].players.findIndex(p => p.canBowl), 1);
assert(JSON.stringify(fe.currentFielders) === JSON.stringify(afterMove), 'manual field persists after setBowler');

// Swap: moving a fielder onto an occupied position swaps them
fe.setFielderPosition('point', 'gully');
assert(fe.currentFielders.includes('point') && fe.currentFielders.includes('gully'), 'swap keeps both positions occupied');

// Field influence: a fielder where the shot goes cuts boundaries vs a gap
const countFourRate = (fielderIds, roster) => {
  let fours = 0;
  const n = 3000;
  for (let i = 0; i < n; i++) {
    const o = calculateOutcome(
      { type: 'good_length', line: 'off', speed: 'fast' },
      { type: 'cover_drive', power: 60 },
      bowler, batsman, fielderIds,
      { confidence: 70, pressure: 0, fieldersRoster: roster }
    );
    if (o.runs === 4) fours++;
  }
  return fours / n;
};
const wellSet = countFourRate(['cover'], { cover: { name: 'Cover Fielder', fielding: { catching: 80, reflex: 80 } } });
const gap = countFourRate(['fine_leg_deep'], { fine_leg_deep: { name: 'Deep Fielder', fielding: { catching: 80, reflex: 80 } } });
assert(wellSet < gap, `fielder on the shot line cuts boundaries (${(wellSet * 100).toFixed(1)}% vs ${(gap * 100).toFixed(1)}% fours)`);

// Catching skill: good hands turn lofted shots into wickets far more often
const catchRate = (skill) => {
  let wickets = 0;
  const n = 2500;
  const roster = { deep_midwicket: { name: 'Fielder', fielding: { catching: skill, reflex: skill } } };
  for (let i = 0; i < n; i++) {
    const o = calculateOutcome(
      { type: 'short', line: 'leg', speed: 'fast' },
      { type: 'lofted_leg', power: 95 },
      bowler, batsman, ['deep_midwicket'],
      { confidence: 70, pressure: 0, fieldersRoster: roster }
    );
    if (o.wicket) wickets++;
  }
  return wickets / n;
};
const goodHands = catchRate(95);
const badHands = catchRate(20);
assert(goodHands > badHands * 1.25, `catching skill matters (${(goodHands * 100).toFixed(1)}% vs ${(badHands * 100).toFixed(1)}% wickets)`);

// ---------- 7. Full innings length ----------
console.log('\n[7] Match length');
const e2 = new MatchEngine({ matchId: 'T', totalOvers: 2, teams });
e2.battingOrder = [0, 1];
e2.startInnings(0);
e2.setBowler(teams[1].players.findIndex(p => p.canBowl), 1);
e2.setBatsman(0, 0);
assert(!e2.setBowler(0, 1), 'setBowler refuses a non-bowler');
let legal = 0;
let safety = 0;
while (!e2.isInningsComplete(0) && safety < 100) {
  safety++;
  const r = e2.processBall(e2.deliveryOptions[0], { type: 'forward_defence', power: 30 }, 0);
  if (!r.outcome.isWide && !r.outcome.isNoBall) legal++;
  if (r.newOver) e2.startNewOver();
}
assert(legal === 12, `full 2-over innings = 12 legal balls (got ${legal})`);

// ---------- 8. High-risk shots & deliveries ----------
console.log('\n[8] High-risk shots & deliveries (scoop, switch hit, slower yorker…)');

// Every innovation shot + delivery exists and has a risk value
const innovationShots = ['scoop', 'reverse_lap', 'ramp', 'switch_hit', 'slog_sweep', 'upper_cut'];
assert(innovationShots.every(id => SHOT_TYPES[id] && SHOT_TYPES[id].risk > 0.35), 'all 6 innovation shots exist with risk > 0.35');
const innovationDels = ['slower_yorker', 'knuckle_ball', 'leg_cutter', 'off_cutter', 'reverse_swing', 'flipper', 'teesra'];
assert(innovationDels.every(id => DELIVERY_TYPES[id] && (DELIVERY_TYPES[id].risk || 0) > 0.2), 'all 7 high-risk deliveries exist with risk > 0.2');

// Skill gates: a weak-technique batsman is never offered scoop/switch hit
const weakBatsman = { ...teams[0].players[0], technique: 40, power: 40, shortBall: 40, timing: 40 };
let weakNeverSees = true;
for (let i = 0; i < 40; i++) {
  const opts = generateShotOptions(weakBatsman, { type: 'yorker', line: 'stumps' });
  if (opts.some(o => ['scoop', 'ramp', 'reverse_lap', 'switch_hit'].includes(o.type))) weakNeverSees = false;
}
assert(weakNeverSees, 'weak batsman never offered scoop/ramp/switch hit');

// A skilled batsman IS offered them against suitable deliveries
const skilledBatsman = { ...teams[0].players[0], technique: 92, power: 90, shortBall: 90, timing: 90 };
// Innovation shots: a skilled batsman can see scoop/ramp/upper cut as the
// mistake trap (high power) or natural counter for a range of deliveries.
// With 3 slots per delivery, not every innovation appears every time.
let skilledInnovationSeen = false;
const innovDeliveries = [
  { type: 'yorker', line: 'off' },
  { type: 'good_length', line: 'off' },
  { type: 'full_tos', line: 'stumps' },
  { type: 'slower_ball', line: 'stumps' },
  { type: 'short', line: 'leg' },
  { type: 'bouncer', line: 'leg' },
];
for (const d of innovDeliveries) {
  for (let i = 0; i < 30; i++) {
    const opts = generateShotOptions(skilledBatsman, d);
    if (opts.some(o => ['scoop','ramp','upper_cut','reverse_lap','switch_hit','slog_sweep'].includes(o.type))) skilledInnovationSeen = true;
  }
}
assert(skilledInnovationSeen, 'skilled batsman sees innovation shots across a range of deliveries');

// RISK = reward AND danger: switching to a risky shot must raise BOTH the
// six rate and the wicket rate vs a safer aggressive shot (same delivery).
const bowler2 = teams[1].players.find(p => p.canBowl);
const batsman2 = { ...teams[0].players[0], technique: 95, power: 95, shortBall: 95, timing: 95 };
const fielders2 = FIELD_PRESETS.balanced.positions;
const rate = (shotType, n = 5000) => {
  let six = 0, wicket = 0;
  for (let i = 0; i < n; i++) {
    const o = calculateOutcome(
      { type: 'good_length', line: 'stumps', speed: 'fast' },
      { type: shotType, power: 95 },
      bowler2, batsman2, fielders2,
      { confidence: 70, pressure: 20 }
    );
    if (o.runs >= 6) six++;
    if (o.wicket) wicket++;
  }
  return { six: six / n, wicket: wicket / n };
};
const safe = rate('lofted_straight');
const risky = rate('switch_hit');
assert(risky.six > safe.six * 1.25, `switch hit raises the six rate (${(risky.six * 100).toFixed(1)}% vs ${(safe.six * 100).toFixed(1)}%)`);
assert(risky.wicket > safe.wicket * 1.1, `switch hit raises the wicket rate (${(risky.wicket * 100).toFixed(1)}% vs ${(safe.wicket * 100).toFixed(1)}%)`);

// High-risk DELIVERY: slower yorker punishes an early swing — more wickets
// (and more sixes when read) than a stock good-length ball
const delRate = (delivery, n = 5000) => {
  let six = 0, wicket = 0;
  for (let i = 0; i < n; i++) {
    const o = calculateOutcome(
      delivery,
      { type: 'lofted_straight', power: 85 },
      bowler2, batsman2, fielders2,
      { confidence: 70, pressure: 20 }
    );
    if (o.runs >= 6) six++;
    if (o.wicket) wicket++;
  }
  return { six: six / n, wicket: wicket / n };
};
const stock = delRate({ type: 'good_length', line: 'stumps', speed: 'fast' });
const slowY = delRate({ type: 'slower_yorker', line: 'stumps', speed: 'change' });
assert(slowY.wicket > stock.wicket * 1.15, `slower yorker raises the wicket rate (${(slowY.wicket * 100).toFixed(1)}% vs ${(stock.wicket * 100).toFixed(1)}%)`);
assert(slowY.six > stock.six * 1.1, `slower yorker read late still goes for six (${(slowY.six * 100).toFixed(1)}% vs ${(stock.six * 100).toFixed(1)}%)`);

// ============================================================
// 9. BOWLER TYPES — every type's library is valid
// ============================================================
console.log('\n[9] Bowler type libraries');
const { BOWLER_TYPES } = require('../engine/cricketEngine');
const TYPES = BOWLER_TYPES;
let typeValid = 0;
for (const [tid, t] of Object.entries(TYPES)) {
  for (const [delId, cfg] of Object.entries(t.deliveries)) {
    assert(DELIVERY_TYPES[delId], `BOWLER_TYPE ${tid} references valid delivery ${delId}`);
    for (const l of cfg.lines) {
      assert(LINES[l], `BOWLER_TYPE ${tid}/${delId} references valid line ${l}`);
    }
    typeValid++;
  }
}
console.log(`     ${typeValid} delivery/library entries across ${Object.keys(TYPES).length} types — all valid`);

// ============================================================
// 10. PER-TYPE ISOLATION — fast never gets spin, spin never gets pace-only
// ============================================================
console.log('\n[10] Per-type delivery isolation');
const PACE_ONLY = ['yorker','wide_yorker','bouncer','slower_ball','slower_yorker','knuckle_ball','leg_cutter','off_cutter','reverse_swing','short'];
const SPIN_TYPES = ['off_break','leg_break','googly','flipper','topspin','carrom','doosra','teesra','arm_ball'];
let isolationOK = true;
const sampleTypes = ['right_arm_fast','right_arm_fast_medium','right_arm_medium','left_arm_fast','left_arm_fast_medium','left_arm_medium'];
const sampleSpin = ['right_arm_off_spin','right_arm_leg_spin','slow_left_arm_orthodox','left_arm_wrist_spin'];
for (const tid of sampleTypes) {
  const bowler = { type: tid, accuracy: 80, yorker: 80, bouncer: 75, variation: 70, seam: 65, swing: 60, spin: 50 };
  for (let i = 0; i < 40; i++) {
    const opts = generateDeliveryOptions(bowler, {});
    for (const o of opts) {
      if (SPIN_TYPES.includes(o.type)) { isolationOK = false; console.log(`  FAST LEAK: ${tid} got ${o.type}`); }
    }
  }
}
for (const tid of sampleSpin) {
  const bowler = { type: tid, accuracy: 80, spin: 85, variation: 80 };
  for (let i = 0; i < 40; i++) {
    const opts = generateDeliveryOptions(bowler, {});
    for (const o of opts) {
      if (PACE_ONLY.includes(o.type)) { isolationOK = false; console.log(`  SPIN LEAK: ${tid} got ${o.type}`); }
    }
  }
}
assert(isolationOK, 'fast types never get spin; spin types never get pace-only deliveries');

// ============================================================
// 11. WIDE/MARGINAL LINE LOGIC
// ============================================================
console.log('\n[11] Marginal line / wide logic');
const wideBowler = { type: 'right_arm_fast', accuracy: 75, yorker: 80, bouncer: 75, variation: 70, seam: 65, swing: 60, mentalStrength: 70 };
const wideBatsman = { timing: 78, technique: 75, power: 70, shortBall: 70, mentalStrength: 70, fielding: { catching: 70 } };
const wideFielders = ['slip','point','cover','mid_off','mid_on','midwicket','square_leg','fine_leg','third_man','long_off','long_on'];
const wideCtx = (bc, wc) => ({ batsmanConfidence: bc, bowlerConfidence: wc, pressure: 15 });
const wideResult = (del, shot, bc, wc) => calculateOutcome(del, { type: shot, power: 60 }, wideBowler, wideBatsman, wideFielders, wideCtx(bc || 70, wc || 70));

// down-leg + cover drive = WIDE (can't reach)
assert(wideResult({type:'good_length',line:'behind'},'cover_drive').isWide, 'down-leg + cover drive = wide');
// down-leg + leave = WIDE
assert(wideResult({type:'good_length',line:'behind'},'leave').isWide, 'down-leg + leave = wide');
// down-leg + scoop with batConf > bowlConf = LEGAL (lap conversion)
assert(!wideResult({type:'good_length',line:'behind'},'scoop',85,60).isWide, 'down-leg + scoop (conf 85>60) = legal');
// down-leg + scoop with batConf < bowlConf = WIDE (mistimed lap)
assert(wideResult({type:'good_length',line:'behind'},'scoop',55,80).isWide, 'down-leg + scoop (conf 55<80) = wide');
// wide-off + leave = WIDE (must play at it)
assert(wideResult({type:'wide_yorker',line:'wide_off'},'leave').isWide, 'wide-off + leave = wide');
// wide-off + cover drive = LEGAL (off-side shot reaches)
assert(!wideResult({type:'wide_yorker',line:'wide_off'},'cover_drive').isWide, 'wide-off + cover drive = legal');
// leg line + flick = LEGAL (normal reachable ball)
assert(!wideResult({type:'good_length',line:'leg'},'flick').isWide, 'leg line + flick = legal');
// Lap conversion boundary rate
let lapBound = 0;
for (let i = 0; i < 400; i++) {
  const o = wideResult({type:'good_length',line:'behind'},'scoop',85,60);
  if (o.runs >= 4) lapBound++;
}
assert(lapBound / 400 > 0.35, `lap conversion at high confidence produces boundaries (${(lapBound / 400 * 100).toFixed(0)}% 4/6 rate)`);

// ============================================================
// 12. SHOT ROLES — defence + counter + mistake for key deliveries
// ============================================================
console.log('\n[12] Shot role structure (defence / counter / mistake)');
const shotBatter = { timing: 78, technique: 80, power: 75, shortBall: 72, mentalStrength: 70, fielding: { catching: 70 } };
const roleCheck = (delivery, expectDefence, expectCounter) => {
  const opts = generateShotOptions(shotBatter, delivery);
  const types = opts.map(o => o.type);
  return {
    hasDefence: types.some(t => expectDefence.includes(t)),
    hasCounter: types.some(t => expectCounter.includes(t)),
    mistake: opts.find(o => o.power >= 78),
    powerRange: opts.map(o => o.power),
  };
};
const r1 = roleCheck({type:'yorker',line:'stumps'}, ['forward_defence'], ['straight_drive','flick']);
assert(r1.hasDefence, 'yorker: forward defence offered');
assert(r1.hasCounter, 'yorker: straight drive/flick offered');
assert(r1.mistake && r1.mistake.power >= 78, 'yorker: mistake shot at high power');

const r2 = roleCheck({type:'short',line:'leg'}, ['back_foot_defence'], ['pull','hook']);
assert(r2.hasDefence, 'short ball: back-foot defence offered');
assert(r2.hasCounter, 'short ball: pull/hook offered');
assert(r2.mistake && r2.mistake.power >= 78, 'short ball: mistake at high power');

const r3 = roleCheck({type:'off_break',line:'stumps'}, ['forward_defence'], ['sweep','paddle']);
assert(r3.hasDefence, 'off-spin: forward defence offered');
assert(r3.hasCounter, 'off-spin: sweep/paddle offered');
assert(r3.mistake && r3.mistake.power >= 78, 'off-spin: mistake at high power');

const r4 = roleCheck({type:'bouncer',line:'leg'}, ['back_foot_defence','leave'], ['hook','pull']);
assert(r4.hasDefence, 'bouncer: defence/leave offered');
assert(r4.hasCounter, 'bouncer: hook/pull offered');

// All 3 options distinct
const r5 = roleCheck({type:'yorker',line:'stumps'}, ['forward_defence'], ['straight_drive']);
assert(new Set(r5.powerRange.map(p => Math.floor(p / 10))).size >= 2, 'shot power values are not all identical');

// ============================================================
// 13. CONFIDENCE BANDS — mistake/defence/counter respond to confidence
// ============================================================
console.log('\n[13] Confidence-driven outcome bands');
const confSim = (del, shot, bc, n) => {
  let w = 0, r4 = 0;
  for (let i = 0; i < n; i++) {
    const o = calculateOutcome(del, { type: shot, power: 60 }, wideBowler, wideBatsman, wideFielders, wideCtx(bc, 70));
    if (o.wicket) w++;
    if (o.runs >= 4) r4++;
  }
  return { w: w / n, r4: r4 / n };
};
// MISTAKE shot (hook vs yorker): low conf → more wickets than high conf
const mistakeLow = confSim({type:'yorker',line:'stumps'}, 'hook', 40, 800);
const mistakeHigh = confSim({type:'yorker',line:'stumps'}, 'hook', 95, 800);
assert(mistakeLow.w > mistakeHigh.w * 1.15, `mistake shot: low conf → more wickets (${(mistakeLow.w * 100).toFixed(1)}% vs ${(mistakeHigh.w * 100).toFixed(1)}%)`);
// PERFECT shot (forward defence): should have near-zero wickets
const perfectLow = confSim({type:'yorker',line:'stumps'}, 'forward_defence', 40, 800);
assert(perfectLow.w < 0.08, `perfect shot (defence) has minimal wickets (${(perfectLow.w * 100).toFixed(1)}%)`);
// DECENT shot (straight drive vs yorker): boundaries increase with confidence
const decentLow = confSim({type:'yorker',line:'stumps'}, 'straight_drive', 40, 800);
const decentHigh = confSim({type:'yorker',line:'stumps'}, 'straight_drive', 95, 800);
assert(decentHigh.r4 > decentLow.r4, `decent shot: high conf → more boundaries (${(decentHigh.r4 * 100).toFixed(1)}% vs ${(decentLow.r4 * 100).toFixed(1)}%)`);

// ============================================================
// 14. INNINGS PRESERVATION — score survives innings break
// ============================================================
console.log('\n[14] Innings score preservation through break');
const ipUsedNames = new Set();
const ipTeamA = generateAutoTeam(0, 72, ipUsedNames);
const ipTeamB = generateAutoTeam(1, 72, ipUsedNames);
const ipEngine = new MatchEngine({ teams: [ipTeamA, ipTeamB], totalOvers: 2 });
ipEngine.startInnings(0);
ipEngine.setBatsman(0, 0); ipEngine.setBowler(8, 1);
for (let b = 0; b < 6; b++) {
  ipEngine.processBall({ type: 'good_length', line: 'stumps', speed: 'fast' }, { type: 'cover_drive', power: 65 }, 0);
}
ipEngine.updateConfidence(0, 1, ipEngine.currentOverBalls[ipEngine.currentOverBalls.length - 1]?.outcome || {});
const scoreAfter1st = ipEngine.score[0];
assert(scoreAfter1st >= 1, 'team 0 has runs after 1 over (innings 1)');
ipEngine.startInnings();
assert(ipEngine.score[0] === scoreAfter1st, `team 0 score preserved after innings break (was ${scoreAfter1st}, now ${ipEngine.score[0]})`);
assert(ipEngine.score[1] === 0, 'team 1 score reset for innings 2');

console.log(`\n${'='.repeat(46)}`);
console.log(`  RESULT: ${pass} passed, ${fail} failed`);
console.log('='.repeat(46));
process.exit(fail > 0 ? 1 : 0);
