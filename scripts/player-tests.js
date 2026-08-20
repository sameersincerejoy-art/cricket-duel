// ============================================================
// CRICKET DUEL — Real-player scenario tests
// Five full matches, each played with a DIFFERENT real-player
// strategy, all asserting the same invariant battery (score
// consistency, chase targets, over limits, confidence bounds,
// field legality/persistence, no NaN). Issues that appear in
// MULTIPLE scenarios are reported as "common" at the end.
//
//   T1 The Slayer    — batsman always maximum power
//   T2 The Grinder   — batsman always defensive / lowest power
//   T3 The Trap      — captain packs the field where the batsman hits,
//                      then leaves a gap; boundaries must rise in the gap
//   T4 The Chaser    — guest bats FIRST (targets the innings-index bug),
//                      chase must end at target with a sane margin
//   T5 The Marathon  — 5-over match, mixed play, over limits + pressure
//
// Run: node scripts/player-tests.js
// ============================================================

const { MatchEngine } = require('../engine/gameEngine');
const { generateAutoTeam } = require('../engine/autoTeam');
const {
  FIELD_PRESETS,
  FIELD_POSITIONS,
  validateField,
  generateDeliveryOptions,
  generateShotOptions,
} = require('../engine/cricketEngine');

// Deterministic PRNG — tests are reproducible, never flaky
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFor(scenario, rep) {
  let h = 2166136261;
  for (let i = 0; i < scenario.length; i++) h = Math.imul(h ^ scenario.charCodeAt(i), 16777619);
  return (h + rep * 7919) >>> 0;
}
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

// ---- Shared invariant battery ----
// Returns an array of { scenario, check, detail } failures.
function runScenario(name, play, rep = 0) {
  Math.random = mulberry32(seedFor(name, rep));
  const failures = [];
  const fail = (check, detail) => failures.push({ scenario: name, check, detail });

  const sharedNames = new Set();
  const teams = [generateAutoTeam(0, 72, sharedNames), generateAutoTeam(1, 72, sharedNames)];
  const engine = new MatchEngine({ matchId: name, totalOvers: play.totalOvers || 2, teams });
  engine.battingOrder = play.battingOrder || [0, 1];

  play.setup && play.setup(engine, teams);

  const innings = [1, 2];
  for (const inn of innings) {
    const battingTeam = engine.battingOrder[inn - 1];
    const bowlingTeam = battingTeam === 0 ? 1 : 0;
    const maxOvers = engine.getBowlerMaxOvers();
    const eligibleBowlers = () => engine.teams[bowlingTeam].players
      .map((p, i) => ({ p, i }))
      .filter(x => x.p.canBowl && engine.getBowlerOversBowled(bowlingTeam, x.i) < maxOvers);
    let bowlerIdx = (eligibleBowlers()[0] || {}).i;
    engine.currentInnings = inn;
    engine.startInnings(battingTeam);
    engine.setBowler(bowlerIdx, bowlingTeam);
    engine.setBatsman(0, battingTeam);
    engine.autoAssignFielders(bowlingTeam);

    let legal = 0;
    let safety = 0;
    while (!engine.isInningsComplete(battingTeam) && safety < 200) {
      safety++;
      const delivery = play.chooseDelivery(engine, bowlingTeam, battingTeam, inn);
      const shot = play.chooseShot(engine, delivery, battingTeam, inn);
      const res = engine.processBall(delivery, shot, battingTeam);
      if (!res.outcome.isWide && !res.outcome.isNoBall) legal++;

      // Live invariants (every ball)
      if (Number.isNaN(engine.score[battingTeam])) fail('score-is-nan', `innings ${inn} ball ${legal}: score NaN`);
      if (engine.wickets[battingTeam] > 10) fail('wickets-over-10', `innings ${inn}: ${engine.wickets[battingTeam]}`);
      const bc = engine.batsmanConfidence[battingTeam];
      const bwc = engine.bowlerConfidence[bowlingTeam];
      if (bc < 20 || bc > 95) fail('batsman-confidence-bounds', `innings ${inn} ball ${legal}: ${bc}`);
      if (bwc < 20 || bwc > 95) fail('bowler-confidence-bounds', `innings ${inn} ball ${legal}: ${bwc}`);

      if (res.newOver) {
        engine.startNewOver();
        // Real captains rotate bowlers within their over limits
        const eligible = eligibleBowlers();
        if (eligible.length > 0 && !engine.isInningsComplete(battingTeam)) {
          const next = eligible.find(x => x.i !== bowlerIdx) || eligible[0];
          bowlerIdx = next.i;
          engine.setBowler(bowlerIdx, bowlingTeam);
        }
      }
      if (res.inningsComplete) break;
    }

    // Per-innings invariants
    const maxLegal = play.totalOvers || 2;
    if (legal > maxLegal * 6) fail('too-many-balls', `innings ${inn}: ${legal} legal balls (max ${maxLegal * 6})`);
    if (legal === maxLegal * 6 && !engine.isInningsComplete(battingTeam)) {
      fail('innings-not-complete', `innings ${inn} finished ${legal} balls without ending`);
    }
  }

  // -------- Post-match invariants --------
  if (engine.status !== 'completed') {
    fail('match-completed', `status is ${engine.status}`);
  }

  for (const t of [0, 1]) {
    // Score = batted runs + extras
    const batted = (engine.batsmanScores || {});
    const battedRuns = Object.entries(batted)
      .filter(([k]) => k.startsWith(`${t}_`))
      .reduce((s, [, v]) => s + (v.runs || 0), 0);
    if (engine.score[t] !== battedRuns + (engine.extras[t] || 0)) {
      fail('score-consistency', `team ${t}: score ${engine.score[t]} != batted ${battedRuns} + extras ${engine.extras[t]}`);
    }

    // Bowling figures sum to the opponent's total
    const opp = t === 0 ? 1 : 0;
    const figures = engine.getBowlerFiguresForTeam(t);
    const conceded = figures.reduce((s, f) => s + (f.runs || 0), 0);
    if (conceded !== engine.score[opp]) {
      fail('bowling-consistency', `team ${t} conceded ${conceded} vs opponent total ${engine.score[opp]}`);
    }

    // Over limits (cricket notation: "2.3" = 2 overs 3 balls)
    const maxOvers = engine.getBowlerMaxOvers();
    for (const f of figures) {
      const [ov, b] = String(f.overs).split('.').map(Number);
      const balls = (ov || 0) * 6 + (b || 0);
      if (balls > maxOvers * 6) fail('over-limit', `${f.name} bowled ${f.overs} (> ${maxOvers} ov)`);
    }
  }

  // Winner sanity
  const result = engine.determineWinner();
  if (result.type === 'runs') {
    const chasing = engine.battingOrder[1];
    const defending = engine.battingOrder[0];
    if (engine.score[chasing] !== engine.score[defending] + result.margin) {
      fail('run-margin', `margin ${result.margin} inconsistent (${engine.score[chasing]} vs ${engine.score[defending]})`);
    }
  } else if (result.type === 'wickets') {
    const chasing = engine.battingOrder[1];
    const used = engine.wickets[chasing];
    if (result.margin !== 10 - used) fail('wicket-margin', `margin ${result.margin} != ${10 - used}`);
  } else {
    const a = engine.score[engine.battingOrder[0]];
    const b = engine.score[engine.battingOrder[1]];
    if (a !== b) fail('tie-margin', `tie but scores differ ${a} vs ${b}`);
  }

  return failures;
}

// ---- T1: The Slayer — always maximum power ----
function t1() {
  const played = [];
  for (let rep = 0; rep < 3; rep++) {
    played.push(...runScenario('T1-Slayer', {
      totalOvers: 2,
      chooseDelivery: (engine) => engine.deliveryOptions[0],
      chooseShot: (engine, delivery) => {
        const opts = generateShotOptions(engine.currentBatsman, delivery);
        return opts.reduce((a, b) => (b.power > a.power ? b : a));
      },
    }, rep));
  }
  return played;
}

// ---- T2: The Grinder — always the most defensive shot ----
function t2() {
  const played = [];
  for (let rep = 0; rep < 3; rep++) {
    played.push(...runScenario('T2-Grinder', {
      totalOvers: 2,
      chooseDelivery: (engine) => {
        return engine.deliveryOptions.find(d => d.type === 'good_length') || engine.deliveryOptions[0];
      },
      chooseShot: (engine, delivery) => {
        const opts = generateShotOptions(engine.currentBatsman, delivery);
        return opts.reduce((a, b) => (b.power < a.power ? b : a));
      },
    }, rep));
  }
  return played;
}

// ---- T3: The Trap — the captain reads the batsman and sets a leg-side trap.
// Batsman ALWAYS lofts to the leg side (lofted_leg, 95%). The trap field packs
// the deep leg boundary (deep midwicket + deep square) where the ball lands;
// the gap field leaves that boundary open. The trap must convert more of those
// lofted shots into wickets and concede fewer runs.
function t3() {
  const failures = [];
  const wicketsCovered = [];
  const wicketsGap = [];
  const caughtCovered = [];
  const caughtGap = [];
  const runsCovered = [];
  const runsGap = [];

  // Trap: deep leg boundary covered (deep midwicket, deep square, midwicket,
  // square leg, fine leg) + 6 off-side fillers. Legal: 5 leg, 3 outside circle.
  const trap = ['deep_midwicket', 'deep_square', 'midwicket', 'square_leg', 'fine_leg', 'slip', 'gully', 'point', 'cover', 'mid_off', 'third_man'];
  // Gap: the deep leg boundary is open — no outfield fielder within reach of
  // the lofted-leg arc (145°); boundary protection is all off-side.
  // Legal: 3 leg, 2 outside circle.
  const gap = ['slip', 'gully', 'point', 'cover', 'extra_cover', 'mid_off', 'long_off', 'third_man', 'square_leg', 'mid_on', 'midwicket'];

  for (const [name, field] of [['trap', trap], ['gap', gap]]) {
    const issues = validateField(field);
    if (issues.length > 0) failures.push({ scenario: 'T3-Trap', check: `${name}-field-legal`, detail: issues.join('; ') });
  }

  const runInnings = (teams, fieldSetup, seed) => {
    Math.random = mulberry32(seed);
    const engine = new MatchEngine({ matchId: 'T3', totalOvers: 2, teams });
    engine.battingOrder = [0, 1];
    engine.currentInnings = 1;
    engine.startInnings(0);
    const bowlerIdx = teams[1].players.findIndex(p => p.canBowl);
    engine.setBowler(bowlerIdx, 1);
    engine.setBatsman(0, 0);
    engine.currentFielders = fieldSetup;
    engine.autoAssignFielders(1);

    // Fixed trap delivery so the ONLY difference is the field (short on leg
    // invites the lofted shot — same ball for both fields)
    const trapDelivery = { type: 'short', line: 'leg', speed: 'fast' };
    let wickets = 0;
    let caught = 0;
    let runs = 0;
    let safety = 0;
    while (!engine.isInningsComplete(0) && safety < 200) {
      safety++;
      const res = engine.processBall(trapDelivery, { type: 'lofted_leg', power: 95 }, 0);
      runs += res.outcome.runs;
      if (res.outcome.wicket) {
        wickets++;
        if (res.outcome.wicketType === 'Caught') caught++;
      }
      if (!res.outcome.isWide && !res.outcome.isNoBall && res.newOver) engine.startNewOver();
      if (res.inningsComplete) break;
    }
    return { wickets, caught, runs };
  };

  for (let rep = 0; rep < 10; rep++) {
    const sharedNames = new Set();
    const teams = [generateAutoTeam(0, 72, sharedNames), generateAutoTeam(1, 72, sharedNames)];
    const c = runInnings(teams, trap, seedFor('T3-trap', rep));
    const g = runInnings(teams, gap, seedFor('T3-gap', rep));
    wicketsCovered.push(c.wickets);
    wicketsGap.push(g.wickets);
    caughtCovered.push(c.caught);
    caughtGap.push(g.caught);
    runsCovered.push(c.runs);
    runsGap.push(g.runs);
  }

  const sum = (arr) => arr.reduce((s, x) => s + x, 0);
  // The field controls CATCHES (bowled/LBW are delivery-driven and identical
  // in both fields). The trap must convert more lofted shots into catches and
  // concede fewer boundary runs.
  if (sum(caughtCovered) <= sum(caughtGap) * 1.15) {
    failures.push({
      scenario: 'T3-Trap',
      check: 'trap-catches',
      detail: `trap ${sum(caughtCovered)} caught vs gap ${sum(caughtGap)} (trap should catch more)`,
    });
  }
  if (sum(runsCovered) >= sum(runsGap) * 0.95) {
    failures.push({
      scenario: 'T3-Trap',
      check: 'trap-concedes-fewer-runs',
      detail: `trap ${sum(runsCovered)} runs vs gap ${sum(runsGap)} (trap should leak fewer)`,
    });
  }
  return failures;
}

// ---- T4: The Chaser — guest bats FIRST, then a chase ----
function t4() {
  const failures = [];

  for (let rep = 0; rep < 3; rep++) {
    const sharedNames = new Set();
    const teams = [generateAutoTeam(0, 72, sharedNames), generateAutoTeam(1, 72, sharedNames)];
    const engine = new MatchEngine({ matchId: 'T4', totalOvers: 2, teams });
    engine.battingOrder = [1, 0]; // team 1 (guest) bats first

    // Innings 1 — team 1 bats, mixed shots
    engine.currentInnings = 1;
    engine.startInnings(1);
    engine.setBowler(engine.teams[0].players.findIndex(p => p.canBowl), 0);
    engine.setBatsman(0, 1);
    engine.autoAssignFielders(0);
    const target1 = engine.score[engine.battingOrder[0]];

    let safety = 0;
    while (!engine.isInningsComplete(1) && safety < 200) {
      safety++;
      const shot = { type: Math.random() < 0.5 ? 'cover_drive' : 'straight_drive', power: rint(40, 80) };
      const res = engine.processBall(engine.deliveryOptions[0], shot, 1);
      if (!res.outcome.isWide && !res.outcome.isNoBall && res.newOver) engine.startNewOver();
      if (res.inningsComplete) break;
    }
    const firstInningsScore = engine.score[1];
    const firstWickets = engine.wickets[1];

    // Innings break (server path: currentInnings = 2 first)
    engine.currentInnings = 2;
    engine.startInnings(0);
    engine.setBowler(engine.teams[1].players.findIndex(p => p.canBowl), 1);
    engine.setBatsman(0, 0);
    engine.autoAssignFielders(1);

    // Chase invariants
    const target = engine.score[engine.battingOrder[0]] + 1;
    if (target !== firstInningsScore + 1) {
      failures.push({ scenario: 'T4-Chaser', check: 'chase-target', detail: `target ${target} != first-innings ${firstInningsScore} + 1 (first innings score was wiped?)` });
    }
    if (engine.score[1] !== firstInningsScore) {
      failures.push({ scenario: 'T4-Chaser', check: 'first-innings-score-preserved', detail: `team1 score ${engine.score[1]} after break, was ${firstInningsScore}` });
    }
    if (engine.wickets[1] !== firstWickets) {
      failures.push({ scenario: 'T4-Chaser', check: 'first-innings-wickets-preserved', detail: `${engine.wickets[1]} != ${firstWickets}` });
    }

    // Innings 2 — chase aggressively
    let chaseLegal = 0;
    safety = 0;
    while (!engine.isInningsComplete(0) && safety < 200) {
      safety++;
      const opts = generateShotOptions(engine.currentBatsman, engine.deliveryOptions[0]);
      const shot = opts.reduce((a, b) => (b.power > a.power ? b : a));
      const res = engine.processBall(engine.deliveryOptions[0], shot, 0);
      if (!res.outcome.isWide && !res.outcome.isNoBall) chaseLegal++;
      if (!res.outcome.isWide && !res.outcome.isNoBall && res.newOver) engine.startNewOver();
      if (res.inningsComplete) break;
    }

    // The chase may end by overs, all out, or target reached — never early
    const final = engine.score[0];
    if (chaseLegal < 12 && engine.wickets[0] < 10 && final < target) {
      failures.push({ scenario: 'T4-Chaser', check: 'chase-completes', detail: `chase ended after ${chaseLegal} balls at ${final} < ${target} without being out` });
    }
    failures.push(...runScenario('T4-Chaser', {
      totalOvers: 2,
      battingOrder: [1, 0],
      setup: (eng) => { eng.battingOrder = [1, 0]; },
      chooseDelivery: (eng) => eng.deliveryOptions[0],
      chooseShot: (eng, d) => generateShotOptions(eng.currentBatsman, d).reduce((a, b) => (b.power > a.power ? b : a)),
    }, rep));
  }
  return failures;
}

// ---- T5: The Marathon — 5 overs, mixed decisions, extras, over limits ----
function t5() {
  const failures = [];
  for (let rep = 0; rep < 2; rep++) {
    failures.push(...runScenario('T5-Marathon', {
      totalOvers: 5,
      chooseDelivery: (engine, bowlingTeam, battingTeam, inn) => {
        const opts = engine.deliveryOptions;
        // Death overs: chase yorkers; otherwise mix
        const ballsLeft = (5 - engine.currentOver) * 6 - engine.currentBall;
        if (inn === 2 && ballsLeft <= 12) {
          return opts.find(d => d.type === 'yorker' || d.type === 'wide_yorker') || opts[0];
        }
        return opts[rint(0, opts.length - 1)];
      },
      chooseShot: (engine, delivery, battingTeam, inn) => {
        const opts = generateShotOptions(engine.currentBatsman, delivery);
        const p = rint(0, 2);
        return opts[p];
      },
    }, rep));
  }
  return failures;
}

// ============================================================
// RUN ALL FIVE
// ============================================================
const all = [
  ...t1().map(f => ({ ...f })),
  ...t2().map(f => ({ ...f })),
  ...t3().map(f => ({ ...f })),
  ...t4().map(f => ({ ...f })),
  ...t5().map(f => ({ ...f })),
];

// Group by check (the common-flow detector)
const byCheck = {};
for (const f of all) {
  (byCheck[f.check] = byCheck[f.check] || []).push(f.scenario);
}

console.log('\n' + '='.repeat(56));
console.log('  PLAYER TEST REPORT');
console.log('='.repeat(56));

const scenarioNames = ['T1-Slayer', 'T2-Grinder', 'T3-Trap', 'T4-Chaser', 'T5-Marathon'];
const scenarioFails = {};
for (const s of scenarioNames) scenarioFails[s] = all.filter(f => f.scenario === s).length;

for (const s of scenarioNames) {
  const n = scenarioFails[s];
  console.log(`\n[${s}] ${n === 0 ? '✅ PASS' : `❌ ${n} failure(s)`}`);
  if (n > 0) {
    all.filter(f => f.scenario === s).forEach(f => {
      console.log(`   - ${f.check}: ${f.detail}`);
    });
  }
}

console.log('\n' + '-'.repeat(56));
console.log('COMMON ISSUES (same check failing in 2+ scenarios):');
const common = Object.entries(byCheck).filter(([, scen]) => new Set(scen).size >= 2);
if (common.length === 0) {
  console.log('  none — every failure is scenario-specific');
} else {
  for (const [check, scen] of common) {
    console.log(`  ⚠ ${check}  →  ${[...new Set(scen)].join(', ')}`);
  }
}
console.log('='.repeat(56));
console.log(`TOTAL: ${all.length} failures across ${scenarioNames.length} scenarios\n`);

process.exit(all.length > 0 ? 1 : 0);
