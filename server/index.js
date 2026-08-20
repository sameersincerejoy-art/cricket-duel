// ============================================================
// CRICKET DUEL — Multiplayer Server
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { MatchEngine } = require('../engine/gameEngine');
const { generateAutoTeam } = require('../engine/autoTeam');
const {
  FIELD_PRESETS,
  generateShotOptions,
  validateField,
  DELIVERY_TYPES,
  LINES,
  SHOT_TYPES,
  BOWLER_TYPES,
  getBowlerTypeName,
  getShotAngle,
  mirrorAngle,
} = require('../engine/cricketEngine');
const compression = require('compression');

const app = express();
const server = http.createServer(app);

// Gzip responses for fast loading over local Wi-Fi
app.use(compression());

// CORS for local network play
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
}));

app.use(express.json());

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
}

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// ============================================================
// GAME STATE
// ============================================================

const games = new Map(); // matchCode -> game state

// How many seconds each player has to make a decision before a
// conservative choice is auto-picked (design doc point 64).
const DECISION_TIMER_SECONDS = 15;

function generateMatchCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function createGameState(matchCode, hostSocketId, config = {}) {
  // One shared name set: a player can never appear in BOTH teams,
  // and team names never collide either.
  const usedNames = new Set();
  const team0 = generateAutoTeam(0, config.teamQuality || 72, usedNames);
  const team1 = generateAutoTeam(1, config.teamQuality || 72, usedNames);
  const teams = [team0, team1];

  const engine = new MatchEngine({
    matchId: matchCode,
    totalOvers: config.totalOvers || 2,
    teams,
  });

  const state = {
    matchCode,
    hostSocketId,
    players: {}, // socketId -> { teamIndex, role }
    teams,
    engine,
    totalOvers: config.totalOvers || 2,
    toss: { completed: false, winner: null, choice: null },
    currentPhase: 'lobby', // lobby, toss, innings1_bowler_select, innings1_bowler_choose, innings1_batsman_choose, innings1_over_break, innings2_bowler_select, innings2_bowler_choose, innings2_batsman_choose, innings2_over_break, completed
    currentInnings: 1,
    currentOver: 0,
    currentBall: 0,
    waitingFor: null, // 'bowler' or 'batsman'
    lastOutcome: null,
    deliveryOptions: [],
    shotOptions: [],
    batsmanConfidence: 70,
    bowlerConfidence: 70,
    pressure: 0,
    fieldPreset: 'balanced',
    currentBowlerIndex: null,
    currentBatsmanIndex: null,
    batsmanSelections: [0, 1], // index of current batsman for each innings
    bowlerSelections: [0, 0], // index of current bowler
    inningFirstBatsman: 0, // which team bats first
  };

  games.set(matchCode, state);
  return state;
}

// ============================================================
// SOCKET.IO HANDLERS
// ============================================================

// Some clients emit events without an ack callback (e.g. start_toss,
// change_field). Guard every callback so the server never crashes on a
// missing callback.
function respond(callback, result) {
  if (typeof callback === 'function') callback(result);
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // --- CREATE GAME ---
  socket.on('create_game', (config, callback) => {
    const matchCode = generateMatchCode();
    const state = createGameState(matchCode, socket.id, config);

    state.players[socket.id] = { teamIndex: 0, role: 'host' };
    socket.join(matchCode);

    console.log(`Game created: ${matchCode} by ${socket.id}`);

    respond(callback, {
      success: true,
      matchCode,
      team: state.teams[0],
      teamIndex: 0,
      // Send both teams so the lobby can show them side by side
      teams: [state.teams[0], null], // opponent team unknown until they join
    });
  });

  // --- JOIN GAME ---
  socket.on('join_game', (matchCode, callback) => {
    const state = games.get(matchCode);

    if (!state) {
      respond(callback, { success: false, error: 'Game not found' });
      return;
    }

    const playerCount = Object.keys(state.players).length;
    if (playerCount >= 2) {
      respond(callback, { success: false, error: 'Game is full' });
      return;
    }

    state.players[socket.id] = { teamIndex: 1, role: 'guest' };
    socket.join(matchCode);

    console.log(`Player joined game ${matchCode}: ${socket.id}`);

    // Notify host with BOTH teams
    io.to(state.hostSocketId).emit('player_joined', {
      team: state.teams[1],
      teamIndex: 1,
      teams: [state.teams[0], state.teams[1]],
    });

    respond(callback, {
      success: true,
      matchCode,
      team: state.teams[1],
      teamIndex: 1,
      teams: [state.teams[0], state.teams[1]],
    });
  });

  // --- START TOSS ---
  socket.on('start_toss', (matchCode, callback) => {
    const state = games.get(matchCode);
    if (!state) return respond(callback, { success: false, error: 'Game not found' });

    state.currentPhase = 'toss';
    io.to(matchCode).emit('toss_started', {});
    respond(callback, { success: true });
  });

  // --- CALL TOSS ---
  socket.on('call_toss', (matchCode, call, callback) => {
    const state = games.get(matchCode);
    if (!state) return respond(callback, { success: false, error: 'Game not found' });

    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const winner = call === result ? socket.id : Object.keys(state.players).find(id => id !== socket.id);

    state.toss.completed = true;
    state.toss.winner = winner;
    state.toss.result = result;

    io.to(matchCode).emit('toss_result', {
      call,
      result,
      winnerSocketId: winner,
      winnerName: state.players[winner]?.role === 'host' ? state.teams[0].name : state.teams[1].name,
    });

    respond(callback, { success: true, result, won: call === result });
  });

  // --- CHOOSE TOSS DECISION ---
  socket.on('toss_decision', (matchCode, decision, callback) => {
    const state = games.get(matchCode);
    if (!state) return respond(callback, { success: false, error: 'Game not found' });

    // Only the toss winner may choose bat or bowl
    if (state.toss.winner && state.toss.winner !== socket.id) {
      return respond(callback, { success: false, error: 'Only the toss winner can decide' });
    }

    // decision: 'bat' or 'bowl'
    const winnerTeamIndex = state.players[socket.id]?.teamIndex || 0;

    if (decision === 'bat') {
      state.inningFirstBatsman = winnerTeamIndex;
    } else {
      state.inningFirstBatsman = winnerTeamIndex === 0 ? 1 : 0;
    }

    state.engine.battingOrder = [state.inningFirstBatsman, state.inningFirstBatsman === 0 ? 1 : 0];
    state.engine.startInnings(state.inningFirstBatsman);

    // Auto-select first bowler and batsman
    const bowlingTeamIndex = state.inningFirstBatsman === 0 ? 1 : 0;
    state.currentBowlerIndex = 0;
    state.currentBatsmanIndex = 0;

    // Ensure fielders are set BEFORE setBowler (which may fail if player 0
    // is not a bowler — openers can't bowl). Without this, currentFielders
    // stays empty and the client sees no fielder dots on the field.
    state.engine.resetFieldToPreset('balanced');
    state.engine.setBowler(0, bowlingTeamIndex);
    state.engine.setBatsman(0, state.inningFirstBatsman);

    // Fielding side's players take positions (best catchers close-in)
    state.engine.autoAssignFielders(bowlingTeamIndex);

    // Batting team picks their opening pair first, then bowling team picks bowler
    state.currentPhase = 'batsman_select';

    io.to(matchCode).emit('toss_decision_made', {
      decision,
      battingTeam: state.teams[state.inningFirstBatsman].name,
      bowlingTeam: state.teams[bowlingTeamIndex].name,
      innings: 1,
    });

    // Send initial match state
    broadcastMatchState(state);

    respond(callback, { success: true });
  });

  // --- SELECT BOWLER ---
  socket.on('select_bowler', (matchCode, bowlerIndex, callback) => {
    const state = games.get(matchCode);
    if (!state) return respond(callback, { success: false, error: 'Game not found' });

    const playerInfo = state.players[socket.id];
    const bowlingTeamIndex = getBowlingTeamIndex(state);
    if (!playerInfo || playerInfo.teamIndex !== bowlingTeamIndex) {
      return respond(callback, { success: false, error: 'Only the bowling team can select a bowler' });
    }

    // Enforce per-bowler over limits (design doc point 45)
    const maxOvers = state.engine.getBowlerMaxOvers();
    const oversBowled = state.engine.getBowlerOversBowled(bowlingTeamIndex, bowlerIndex);
    if (oversBowled >= maxOvers) {
      return respond(callback, {
        success: false,
        error: `This bowler has already bowled their limit of ${maxOvers} over(s)`,
      });
    }

    state.currentBowlerIndex = bowlerIndex;
    state.engine.setBowler(bowlerIndex, bowlingTeamIndex);

    state.deliveryOptions = state.engine.deliveryOptions;

    io.to(matchCode).emit('bowler_selected', {
      bowler: state.engine.currentBowler,
      bowlerIndex,
    });

    // Now bowler chooses delivery — shown ONLY to the bowling player.
    // The batsman must never see the delivery options (hidden information).
    state.currentPhase = `innings${state.currentInnings}_bowler_choose`;
    state.waitingFor = 'bowler';

    const bowlerSocketId = getSocketIdForTeam(state, bowlingTeamIndex);
    const batsmanSocketId = getSocketIdForTeam(state, getBattingTeamIndex(state));

    if (bowlerSocketId) {
      io.to(bowlerSocketId).emit('bowler_choose_delivery', {
        bowler: state.engine.currentBowler,
        bowlerTypeName: getBowlerTypeName(state.engine.currentBowler?.type),
        batsman: state.engine.currentBatsman,
        options: state.deliveryOptions,
        fieldPreset: state.fieldPreset,
        fielders: state.engine.currentFielders,
        fielderRoster: getFieldRoster(state),
        confidence: state.bowlerConfidence,
        batsmanMemory: getRecentShots(state, 6),
        timerSeconds: DECISION_TIMER_SECONDS,
      });
    }
    if (batsmanSocketId) {
      io.to(batsmanSocketId).emit('waiting_for', {
        message: 'Bowler is choosing a delivery...',
      });
    }

    startDecisionTimer(state, DECISION_TIMER_SECONDS);

    respond(callback, { success: true });
  });

  // --- CHOOSE DELIVERY ---
  socket.on('choose_delivery', (matchCode, delivery, callback) => {
    const state = games.get(matchCode);
    if (!state) return respond(callback, { success: false, error: 'Game not found' });

    const playerInfo = state.players[socket.id];
    if (!playerInfo || playerInfo.teamIndex !== getBowlingTeamIndex(state)) {
      return respond(callback, { success: false, error: 'Only the bowling team can choose a delivery' });
    }

    // Cricketing validation: the delivery must be in THIS bowler type's
    // library and on a legal line for it (a fast bowler can't bowl an off
    // break; an off spinner can't bowl a bouncer).
    const lib = BOWLER_TYPES[state.engine.currentBowler?.type]?.deliveries;
    const cfg = lib && delivery ? lib[delivery.type] : null;
    if (!cfg || !cfg.lines.includes(delivery.line)) {
      return respond(callback, {
        success: false,
        error: `⚠️ ${getBowlerTypeName(state.engine.currentBowler?.type)} cannot bowl that delivery`,
      });
    }

    handleDeliveryChosen(state, delivery);

    respond(callback, { success: true });
  });

  // --- CHOOSE SHOT ---
  socket.on('choose_shot', (matchCode, shot, callback) => {
    const state = games.get(matchCode);
    if (!state) return respond(callback, { success: false, error: 'Game not found' });

    const playerInfo = state.players[socket.id];
    if (!playerInfo || playerInfo.teamIndex !== getBattingTeamIndex(state)) {
      return respond(callback, { success: false, error: 'Only the batting team can choose a shot' });
    }

    handleShotChosen(state, shot);

    respond(callback, { success: true });
  });

  // --- CHANGE FIELD ---
  socket.on('change_field', (matchCode, preset, callback) => {
    const state = games.get(matchCode);
    if (!state) return respond(callback, { success: false, error: 'Game not found' });

    const playerInfo = state.players[socket.id];
    if (!playerInfo || playerInfo.teamIndex !== getBowlingTeamIndex(state)) {
      return respond(callback, { success: false, error: 'Only the bowling team can change the field' });
    }

    const positions = FIELD_PRESETS[preset]?.positions || FIELD_PRESETS.balanced.positions;

    // Reject illegal formations and explain why (design doc point 18)
    const issues = validateField(positions);
    if (issues.length > 0) {
      return respond(callback, {
        success: false,
        error: `⚠️ ILLEGAL FIELD: ${issues.join(' • ')}`,
      });
    }

    state.fieldPreset = preset;
    state.engine.resetFieldToPreset(preset);
    // Re-map players onto the new positions (best catchers close-in)
    state.engine.autoAssignFielders(getBowlingTeamIndex(state));

    io.to(matchCode).emit('field_changed', {
      preset,
      fielders: state.engine.currentFielders,
      fielderRoster: getFieldRoster(state),
    });

    respond(callback, { success: true });
  });

  // --- MOVE FIELDER (manual field editing) ---
  socket.on('move_fielder', (matchCode, fromPos, toPos, callback) => {
    const state = games.get(matchCode);
    if (!state) return respond(callback, { success: false, error: 'Game not found' });

    const playerInfo = state.players[socket.id];
    if (!playerInfo || playerInfo.teamIndex !== getBowlingTeamIndex(state)) {
      return respond(callback, { success: false, error: 'Only the bowling team can change the field' });
    }

    const newFielders = state.engine.setFielderPosition(fromPos, toPos);
    if (!newFielders) {
      return respond(callback, { success: false, error: 'Invalid field position' });
    }

    // Reject illegal formations and explain why (design doc point 18)
    const issues = validateField(newFielders);
    if (issues.length > 0) {
      // Roll the move back
      state.engine.setFielderPosition(toPos, fromPos);
      return respond(callback, {
        success: false,
        error: `⚠️ ILLEGAL FIELD: ${issues.join(' • ')}`,
      });
    }

    io.to(matchCode).emit('field_changed', {
      preset: state.fieldPreset,
      fielders: state.engine.currentFielders,
      fielderRoster: getFieldRoster(state),
    });

    respond(callback, { success: true });
  });

  // --- SELECT BATSMAN ---
  socket.on('select_batsman', (matchCode, batsmanIndex, callback) => {
    const state = games.get(matchCode);
    if (!state) return respond(callback, { success: false, error: 'Game not found' });

    state.currentBatsmanIndex = batsmanIndex;
    const battingTeamIndex = state.engine.battingOrder[state.engine.currentInnings - 1];
    state.engine.setBatsman(batsmanIndex, battingTeamIndex);

    respond(callback, { success: true });
  });

  // --- GET BOWLING OPTIONS ---
  socket.on('get_bowling_options', (matchCode, callback) => {
    const state = games.get(matchCode);
    if (!state) return respond(callback, { success: false, error: 'Game not found' });

    const bowlingTeamIndex = getBowlingTeamIndex(state);
    const maxOvers = state.engine.getBowlerMaxOvers();
    const players = state.teams[bowlingTeamIndex].players;
    const bowlers = players
      .map((p, i) => ({ index: i, player: p }))
      .filter(x => x.player.canBowl)
      .map(x => ({
        index: x.index,
        name: x.player.name,
        type: x.player.type,
        typeName: getBowlerTypeName(x.player.type),
        oversBowled: state.engine.getBowlerOversBowled(bowlingTeamIndex, x.index),
        maxOvers,
        exhausted: state.engine.getBowlerOversBowled(bowlingTeamIndex, x.index) >= maxOvers,
      }));

    respond(callback, { success: true, maxOvers, bowlers });
  });

  // --- GET BATTING OPTIONS ---
  socket.on('get_batting_options', (matchCode, callback) => {
    const state = games.get(matchCode);
    if (!state) return respond(callback, { success: false, error: 'Game not found' });

    const battingTeamIndex = getBattingTeamIndex(state);
    const players = state.teams[battingTeamIndex].players;
    const batsmen = players.map((p, i) => ({
      index: i,
      name: p.name,
      role: p.role,
      hand: p.handed === 'left' ? 'L-handed' : 'R-handed',
      out: state.engine.batsmanScores[`${battingTeamIndex}_${i}`]?.out || false,
    }));

    respond(callback, { success: true, batsmen });
  });

  // --- SELECT OPENING BATSMEN ---
  socket.on('select_opening_batsmen', (matchCode, strikerIdx, nonStrikerIdx, callback) => {
    const state = games.get(matchCode);
    if (!state) return respond(callback, { success: false, error: 'Game not found' });

    const playerInfo = state.players[socket.id];
    const battingTeamIndex = getBattingTeamIndex(state);
    if (!playerInfo || playerInfo.teamIndex !== battingTeamIndex) {
      return respond(callback, { success: false, error: 'Only the batting team can select batsmen' });
    }

    // Validate indices
    const team = state.teams[battingTeamIndex];
    if (strikerIdx < 0 || strikerIdx >= team.players.length ||
        nonStrikerIdx < 0 || nonStrikerIdx >= team.players.length ||
        strikerIdx === nonStrikerIdx) {
      return respond(callback, { success: false, error: 'Invalid batsman selection' });
    }

    // Set the opening pair
    state.engine.setBatsman(strikerIdx, battingTeamIndex);
    state.engine.strikerIndex = strikerIdx;
    state.engine.nonStrikerIndex = nonStrikerIdx;
    state.currentBatsmanIndex = strikerIdx;

    // Transition to bowler selection phase
    const bowlingTeamIndex = getBowlingTeamIndex(state);
    state.currentPhase = 'bowler_select';

    // Broadcast updated match state so both teams see the selected batsmen
    broadcastMatchState(state);

    respond(callback, { success: true });
  });

  // --- DISCONNECT ---
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);

    // Find and clean up games
    for (const [code, state] of games.entries()) {
      if (state.players[socket.id]) {
        delete state.players[socket.id];
        clearDecisionTimer(state);
        io.to(code).emit('player_disconnected', { role: state.players[socket.id]?.role });

        // Clean up empty games after delay
        if (Object.keys(state.players).length === 0) {
          setTimeout(() => {
            if (games.has(code) && Object.keys(games.get(code).players).length === 0) {
              games.delete(code);
              console.log(`Game ${code} cleaned up`);
            }
          }, 30000);
        }
      }
    }
  });
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getBattingTeamIndex(state) {
  return state.engine.battingOrder[state.engine.currentInnings - 1];
}

function getBowlingTeamIndex(state) {
  return getBattingTeamIndex(state) === 0 ? 1 : 0;
}

function getSocketIdForTeam(state, teamIndex) {
  for (const [socketId, info] of Object.entries(state.players)) {
    if (info.teamIndex === teamIndex) return socketId;
  }
  return null;
}

function broadcastMatchState(state) {
  for (const [socketId, playerInfo] of Object.entries(state.players)) {
    const battingTeamIndex = getBattingTeamIndex(state);
    const bowlingTeamIndex = getBowlingTeamIndex(state);

    const matchState = {
      matchCode: state.matchCode,
      status: state.engine.status,
      phase: state.currentPhase,
      currentInnings: state.engine.currentInnings,
      currentOver: state.engine.currentOver,
      currentBall: state.engine.currentBall,
      totalOvers: state.totalOvers,
      score: state.engine.score[battingTeamIndex],
      wickets: state.engine.wickets[battingTeamIndex],
      battingTeam: state.teams[battingTeamIndex].name,
      battingTeamIndex,
      bowlingTeam: state.teams[bowlingTeamIndex].name,
      target: state.engine.currentInnings === 2 ? state.engine.score[state.engine.battingOrder[0]] + 1 : null,
      pressure: state.engine.pressure,
      confidence: {
        batsman: state.engine.batsmanConfidence[battingTeamIndex],
        bowler: state.engine.bowlerConfidence[bowlingTeamIndex],
      },
      fieldPreset: state.fieldPreset,
      fielders: state.engine.currentFielders,
      ballHistory: state.engine.currentOverBalls.map(b => ({
        result: b.outcome.runs,
        wicket: b.outcome.wicket,
        isWide: b.outcome.isWide,
        isNoBall: b.outcome.isNoBall,
      })),
      batsmanScores: state.engine.getBatsmanScoresForTeam(battingTeamIndex),
      bowlerFigures: state.engine.getBowlerFiguresForTeam(bowlingTeamIndex),
      currentBowler: state.engine.currentBowler ? {
        name: state.engine.currentBowler.name,
        type: state.engine.currentBowler.type,
        typeName: getBowlerTypeName(state.engine.currentBowler.type),
      } : null,
      fielderRoster: getFieldRoster(state),
      strikerHanded: state.engine.currentBatsman?.handed || 'right',
      nonStrikerHanded: (() => {
        const battingTeamIdx = getBattingTeamIndex(state);
        const nsIdx = state.engine.nonStrikerIndex ?? 0;
        return state.teams[battingTeamIdx]?.players[nsIdx]?.handed || 'right';
      })(),
      yourTeamIndex: playerInfo.teamIndex,
      yourTeam: state.teams[playerInfo.teamIndex],
    };

    io.to(socketId).emit('match_state', matchState);
  }
}

function startSecondInnings(state) {
  clearDecisionTimer(state);
  state.currentInnings = 2;
  state.engine.currentInnings = 2;
  state.engine.startInnings(state.engine.battingOrder[1]);

  state.currentBowlerIndex = 0;
  state.currentBatsmanIndex = 0;

  const bowlingTeamIndex = state.engine.battingOrder[1] === 0 ? 1 : 0;
  // Fresh field for the new fielding side — the other team's moves must not carry over
  state.engine.resetFieldToPreset('balanced');
  state.fieldPreset = 'balanced';
  state.engine.setBowler(0, bowlingTeamIndex);
  state.engine.setBatsman(0, state.engine.battingOrder[1]);
  state.engine.autoAssignFielders(bowlingTeamIndex);

  state.currentPhase = 'innings2_bowler_select';

  io.to(state.matchCode).emit('innings_break', {
    innings: 2,
    scorecard: state.engine.getScorecard(),
    battingTeam: state.teams[state.engine.battingOrder[1]].name,
    bowlingTeam: state.teams[bowlingTeamIndex].name,
    target: state.engine.score[state.engine.battingOrder[0]] + 1,
  });

  broadcastMatchState(state);
}

function startNewOver(state) {
  clearDecisionTimer(state);
  const res = state.engine.startNewOver();
  state.currentOver = state.engine.currentOver;

  const bowlingTeamIndex = getBowlingTeamIndex(state);

  io.to(state.matchCode).emit('new_over', {
    over: state.engine.currentOver,
    score: state.engine.score,
    wickets: state.engine.wickets,
    fieldChangeAllowed: true,
  });

  // Safety net: if the innings ended exactly on the last ball of the final over
  if (res.inningsComplete) {
    if (state.currentInnings === 1) {
      startSecondInnings(state);
    } else {
      state.currentPhase = 'completed';
      io.to(state.matchCode).emit('match_completed', {
        scorecard: state.engine.getScorecard(),
        result: state.engine.determineWinner(),
        timeline: buildTimeline(state),
      });
    }
    return;
  }

  // Reset bowler selection for new over
  state.currentPhase = `innings${state.currentInnings}_bowler_select`;
  state.waitingFor = null;

  broadcastMatchState(state);
}

function prepareNextBall(state) {
  clearDecisionTimer(state);
  const bowlingTeamIndex = getBowlingTeamIndex(state);
  state.engine.setBowler(state.currentBowlerIndex, bowlingTeamIndex);
  state.deliveryOptions = state.engine.deliveryOptions;

  state.currentPhase = `innings${state.currentInnings}_bowler_choose`;
  state.waitingFor = 'bowler';

  const bowlerSocketId = getSocketIdForTeam(state, bowlingTeamIndex);
  const batsmanSocketId = getSocketIdForTeam(state, getBattingTeamIndex(state));

  if (bowlerSocketId) {
    io.to(bowlerSocketId).emit('bowler_choose_delivery', {
      bowler: state.engine.currentBowler,
      bowlerTypeName: getBowlerTypeName(state.engine.currentBowler?.type),
      batsman: state.engine.currentBatsman,
      options: state.deliveryOptions,
      fieldPreset: state.fieldPreset,
      fielders: state.engine.currentFielders,
      fielderRoster: getFieldRoster(state),
      confidence: state.bowlerConfidence,
      batsmanMemory: getRecentShots(state, 6),
      timerSeconds: DECISION_TIMER_SECONDS,
    });
  }
  if (batsmanSocketId) {
    io.to(batsmanSocketId).emit('waiting_for', {
      message: 'Bowler is choosing a delivery...',
    });
  }

  startDecisionTimer(state, DECISION_TIMER_SECONDS);
}

// ============================================================
// FIELD ROSTER — who stands where (design doc points 16-19)
// ============================================================

function getFieldRoster(state) {
  const roster = {};
  for (const [posId, player] of Object.entries(state.engine.fielderByPosition || {})) {
    if (player) {
      roster[posId] = {
        name: player.name,
        role: player.role,
        catching: player.fielding?.catching || 60,
      };
    }
  }
  return roster;
}

// ============================================================
// MEMORY — recent deliveries / shots (design doc points 40-41)
// ============================================================

function getRecentDeliveries(state, count) {
  const innings = state.engine.currentInnings;
  const bowlerIdx = state.currentBowlerIndex;
  return state.engine.ballHistory
    .filter(b => b.innings === innings && b.bowlerIndex === bowlerIdx && !b.outcome.isWide && !b.outcome.isNoBall)
    .slice(-count)
    .map(b => ({
      type: DELIVERY_TYPES[b.delivery.type]?.name || b.delivery.type,
      line: LINES[b.delivery.line]?.name || b.delivery.line,
      result: b.outcome.runs,
      wicket: b.outcome.wicket,
    }));
}

function getRecentShots(state, count) {
  const innings = state.engine.currentInnings;
  const batsmanIdx = state.engine.currentBatsmanIndex;
  return state.engine.ballHistory
    .filter(b => b.innings === innings && b.batsmanIndex === batsmanIdx && !b.outcome.isWide && !b.outcome.isNoBall)
    .slice(-count)
    .map(b => ({
      shot: SHOT_TYPES[b.shot.type]?.name || b.shot.type,
      power: b.shot.power,
      result: b.outcome.runs,
      wicket: b.outcome.wicket,
    }));
}

// ============================================================
// DECISION TIMER — auto-pick a conservative choice on timeout
// ============================================================

// Ball-by-ball timeline for the post-match screen (design doc point 50)
function buildTimeline(state) {
  return state.engine.ballHistory.map(b => ({
    innings: b.innings,
    over: b.over,
    ball: b.ball,
    delivery: {
      type: DELIVERY_TYPES[b.delivery.type]?.name || b.delivery.type,
      line: LINES[b.delivery.line]?.name || b.delivery.line,
    },
    shot: {
      type: SHOT_TYPES[b.shot.type]?.name || b.shot.type,
      power: b.shot.power,
    },
    outcome: {
      runs: b.outcome.runs,
      extraRuns: b.outcome.extraRuns || 0,
      wicket: b.outcome.wicket,
      wicketType: b.outcome.wicketType,
      isWide: b.outcome.isWide,
      isNoBall: b.outcome.isNoBall,
      description: b.outcome.description,
    },
    score: b.score,
    wickets: b.wickets,
  }));
}

function clearDecisionTimer(state) {
  if (state.decisionTimer) {
    clearTimeout(state.decisionTimer);
    state.decisionTimer = null;
  }
}

function startDecisionTimer(state, seconds) {
  clearDecisionTimer(state);
  state.decisionTimer = setTimeout(() => {
    // Only act if the game still exists and we're still waiting on this decision
    if (games.get(state.matchCode) !== state) return;

    if (state.waitingFor === 'bowler') {
      const option = pickConservativeDelivery(state);
      if (option) handleDeliveryChosen(state, option, true);
    } else if (state.waitingFor === 'batsman') {
      const option = pickConservativeShot(state);
      if (option) handleShotChosen(state, option, true);
    }
  }, seconds * 1000);
}

function pickConservativeDelivery(state) {
  // Prefer a standard good-length delivery; otherwise the first option
  const options = state.deliveryOptions || [];
  return options.find(o => o.type === 'good_length') || options[0] || null;
}

function pickConservativeShot(state) {
  // Lowest power = most conservative shot
  const options = state.shotOptions || [];
  return [...options].sort((a, b) => (a.power || 0) - (b.power || 0))[0] || null;
}

// --- DELIVERY CHOSEN (by player or timer) ---
function handleDeliveryChosen(state, delivery, auto = false) {
  clearDecisionTimer(state);

  // Save delivery choice (hidden from batsman)
  state.selectedDelivery = delivery;

  // Generate shot options for the current batsman
  const battingTeamIndex = getBattingTeamIndex(state);
  state.engine.setBatsman(state.engine.currentBatsmanIndex, battingTeamIndex);
  state.shotOptions = generateShotOptions(state.engine.currentBatsman, delivery);

  // Notify batsman to choose
  state.currentPhase = `innings${state.currentInnings}_batsman_choose`;
  state.waitingFor = 'batsman';

  const batsmanSocketId = getSocketIdForTeam(state, battingTeamIndex);
  const bowlerSocketId = getSocketIdForTeam(state, getBowlingTeamIndex(state));      if (batsmanSocketId) {
    io.to(batsmanSocketId).emit('batsman_choose_shot', {
      batsman: state.engine.currentBatsman,
      options: state.shotOptions,
      fielders: state.engine.currentFielders,
      fielderRoster: getFieldRoster(state),
      fieldPreset: state.fieldPreset,
      confidence: state.batsmanConfidence,
      matchState: {
        score: state.engine.score[battingTeamIndex],
        wickets: state.engine.wickets[battingTeamIndex],
        over: state.engine.currentOver,
        ball: state.engine.currentBall,
        totalOvers: state.totalOvers,
        target: state.engine.currentInnings === 2 ? state.engine.score[state.engine.battingOrder[0]] + 1 : null,
        pressure: state.engine.pressure,
      },
      bowlerName: state.engine.currentBowler?.name,
      bowlerType: state.engine.currentBowler?.type,
      bowlerTypeName: getBowlerTypeName(state.engine.currentBowler?.type),
      ballHistory: state.engine.currentOverBalls.map(b => ({
        result: b.outcome.runs,
        wicket: b.outcome.wicket,
        isWide: b.outcome.isWide,
        isNoBall: b.outcome.isNoBall,
      })),
      bowlerMemory: getRecentDeliveries(state, 6),
      timerSeconds: DECISION_TIMER_SECONDS,
    });
  }
  if (bowlerSocketId) {
    io.to(bowlerSocketId).emit('waiting_for', {
      message: 'Batsman is choosing a shot...',
    });
  }

  startDecisionTimer(state, DECISION_TIMER_SECONDS);
}

// --- SHOT CHOSEN (by player or timer) ---
function handleShotChosen(state, shot, auto = false) {
  clearDecisionTimer(state);

  // Process the ball
  const battingTeamIndex = getBattingTeamIndex(state);
  const result = state.engine.processBall(state.selectedDelivery, shot, battingTeamIndex);

  state.lastOutcome = result.outcome;
  // Wickets advance the batsman inside the engine — keep server index in sync
  state.currentBatsmanIndex = state.engine.currentBatsmanIndex;

  // Broadcast result (public — both players see it)
  // Include shot trail data so the field view can animate the ball path.
  const shotType = result.ballRecord.shot?.type;
  const strikerHanded = state.engine.currentBatsman?.handed || 'right';
  const baseShotAngle = getShotAngle(shotType, 'right');
  const shotAngle = strikerHanded === 'left' ? mirrorAngle(baseShotAngle) : baseShotAngle;

  io.to(state.matchCode).emit('ball_result', {
    outcome: result.outcome,
    ballRecord: result.ballRecord,
    score: state.engine.score[battingTeamIndex],
    wickets: state.engine.wickets[battingTeamIndex],
    over: state.engine.currentOver,
    ball: result.ballRecord.ball,
    confidence: {
      batsman: state.engine.batsmanConfidence[battingTeamIndex],
      bowler: state.engine.bowlerConfidence[getBowlingTeamIndex(state)],
    },
    pressure: state.engine.pressure,
    explanation: result.outcome.explanation,
    // Ball trail animation data
    trail: {
      shotType,
      shotAngle,
      runs: result.outcome.runs,
      wicket: result.outcome.wicket,
      wicketType: result.outcome.wicketType,
      isWide: result.outcome.isWide,
      isNoBall: result.outcome.isNoBall,
      catchPosition: result.outcome.catchFielderName || null,
    },
  });

  // Check if innings complete
  if (result.inningsComplete) {
    if (state.currentInnings === 1) {
      // Start second innings
      setTimeout(() => {
        startSecondInnings(state);
      }, 3000);
    } else {
      // Match complete
      setTimeout(() => {
        state.currentPhase = 'completed';
        io.to(state.matchCode).emit('match_completed', {
          scorecard: state.engine.getScorecard(),
          result: state.engine.determineWinner(),
          timeline: buildTimeline(state),
        });
      }, 3000);
    }
  } else if (result.newOver) {
    // New over - field changes allowed
    setTimeout(() => {
      startNewOver(state);
    }, 2000);
  } else {
    // Next ball - same bowler, same field
    setTimeout(() => {
      prepareNextBall(state);
    }, 2000);
  }
}

// ============================================================
// REST API FOR SIMPLE STATUS
// ============================================================

app.get('/api/games', (req, res) => {
  const gameList = [];
  for (const [code, state] of games.entries()) {
    gameList.push({
      matchCode: code,
      players: Object.keys(state.players).length,
      phase: state.currentPhase,
    });
  }
  res.json(gameList);
});

// Production: serve client
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🏏 Cricket Duel Server running on port ${PORT}`);
  console.log(`\nTo play, connect your phones to the same Wi-Fi/hotspot`);
  console.log(`Then open: http://localhost:${PORT}\n`);
});
