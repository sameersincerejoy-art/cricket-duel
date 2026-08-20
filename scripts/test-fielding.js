#!/usr/bin/env node
// ============================================================
// FIELDING IMPACT TEST — Simulate 1 over (6 balls) per preset
// Shows how different fielding setups affect scoring
// ============================================================

const { MatchEngine } = require('../engine/gameEngine');
const { generateAutoTeam } = require('../engine/autoTeam');
const {
  FIELD_PRESETS,
  FIELD_POSITIONS,
  generateShotOptions,
  DELIVERY_TYPES,
  LINES,
  SHOT_TYPES,
  BOWLER_TYPES,
  getBowlerTypeName,
} = require('../engine/cricketEngine');

const BALLS_PER_OVER = 6;

function createMatch() {
  const usedNames = new Set();
  const team0 = generateAutoTeam(0, 72, usedNames);
  const team1 = generateAutoTeam(1, 72, usedNames);
  const teams = [team0, team1];

  const engine = new MatchEngine({
    matchId: 'test',
    totalOvers: 2,
    teams,
  });

  return { engine, teams };
}

function simulateOver(presetKey) {
  const { engine, teams } = createMatch();
  const bowlingTeamIndex = 1;
  const battingTeamIndex = 0;

  engine.startInnings(battingTeamIndex);

  // Find a valid bowler from the bowling team
  const bowlingPlayers = teams[bowlingTeamIndex].players;
  const bowlerIdx = bowlingPlayers.findIndex(p => p.canBowl);
  if (bowlerIdx === -1) {
    console.error('No valid bowler found!');
    return null;
  }

  const bowlerResult = engine.setBowler(bowlerIdx, bowlingTeamIndex);
  if (!bowlerResult) {
    console.error(`setBowler failed for index ${bowlerIdx}`);
    return null;
  }

  // Set field to the preset
  engine.resetFieldToPreset(presetKey);
  engine.autoAssignFielders(bowlingTeamIndex);

  // Pick first batsman
  const batsmanIdx = 0;
  engine.setBatsman(batsmanIdx, battingTeamIndex);

  // Check delivery options
  const deliveryOptions = engine.deliveryOptions;
  if (!deliveryOptions || deliveryOptions.length === 0) {
    console.error(`No delivery options for preset ${presetKey}!`);
    console.error('  bowler:', engine.currentBowler?.name, 'type:', engine.currentBowler?.type);
    return null;
  }

  const results = [];
  let totalRuns = 0;
  let wickets = 0;
  let fours = 0;
  let sixes = 0;
  let dots = 0;

  for (let ball = 0; ball < BALLS_PER_OVER; ball++) {
    // Pick a random delivery from the options
    const delivery = deliveryOptions[Math.floor(Math.random() * deliveryOptions.length)];

    // Generate shot options for the current batsman
    const shotOptions = generateShotOptions(engine.currentBatsman, delivery);
    if (!shotOptions || shotOptions.length === 0) break;

    // Pick a random shot
    const shot = shotOptions[Math.floor(Math.random() * shotOptions.length)];

    // Process the ball
    const result = engine.processBall(delivery, shot, battingTeamIndex);
    if (!result) break;

    const runs = result.outcome.runs + (result.outcome.extraRuns || 0);
    totalRuns += runs;
    if (result.outcome.wicket) wickets++;
    if (result.outcome.runs === 4) fours++;
    if (result.outcome.runs === 6) sixes++;
    if (result.outcome.runs === 0 && !result.outcome.isWide && !result.outcome.isNoBall) dots++;

    results.push({
      ball: ball + 1,
      delivery: `${DELIVERY_TYPES[delivery.type]?.name || delivery.type} on ${LINES[delivery.line]?.name || delivery.line}`,
      shot: `${SHOT_TYPES[shot.type]?.name || shot.type} (power ${shot.power})`,
      runs: result.outcome.runs,
      wicket: result.outcome.wicket,
      wicketType: result.outcome.wicketType,
      description: result.outcome.description,
    });

    if (result.inningsComplete) break;
  }

  return {
    preset: presetKey,
    presetName: FIELD_PRESETS[presetKey]?.name || presetKey,
    totalRuns,
    wickets,
    fours,
    sixes,
    dots,
    balls: results.length,
    results,
    score: engine.score[battingTeamIndex],
    wicketsFell: engine.wickets[battingTeamIndex],
  };
}

// ============================================================
// RUN THE TEST
// ============================================================
console.log('🏏 FIELDING IMPACT TEST — 1 over per preset\n');
console.log('='.repeat(70));

const presets = Object.keys(FIELD_PRESETS);
const summary = [];

for (const preset of presets) {
  const result = simulateOver(preset);
  if (!result) continue;
  summary.push(result);

  console.log(`\n📋 ${result.presetName} (${preset})`);
  console.log(`   Score: ${result.score}/${result.wicketsFell} in ${result.balls} balls`);
  console.log(`   Runs: ${result.totalRuns} | 4s: ${result.fours} | 6s: ${result.sixes} | Dots: ${result.dots} | Wkts: ${result.wickets}`);

  for (const ball of result.results) {
    const wicketMark = ball.wicket ? ` ❌ ${ball.wicketType}` : '';
    console.log(`     Ball ${ball.ball}: ${ball.description} (${ball.runs} runs)${wicketMark}`);
  }
}

// ============================================================
// COMPARISON TABLE
// ============================================================
console.log('\n' + '='.repeat(70));
console.log('📊 COMPARISON SUMMARY\n');
console.log(
  'Preset'.padEnd(16) +
  'Runs'.padStart(6) +
  'Wkts'.padStart(6) +
  '4s'.padStart(5) +
  '6s'.padStart(5) +
  'Dots'.padStart(6) +
  'Run Rate'.padStart(10)
);
console.log('-'.repeat(55));

for (const s of summary) {
  const runRate = s.balls > 0 ? ((s.totalRuns / s.balls) * 6).toFixed(1) : '0.0';
  console.log(
    s.presetName.padEnd(16) +
    String(s.totalRuns).padStart(6) +
    String(s.wickets).padStart(6) +
    String(s.fours).padStart(5) +
    String(s.sixes).padStart(5) +
    String(s.dots).padStart(6) +
    (runRate + '/ov').padStart(10)
  );
}

// ============================================================
// FIELD INFLUENCE DETAIL — Which shots are covered/gapped?
// ============================================================
console.log('\n' + '='.repeat(70));
console.log('🔍 FIELD COVERAGE ANALYSIS — Which shots find a fielder?\n');

const testAngles = {
  'Cover Drive (off)': 45,
  'Straight Drive': 5,
  'On Drive (leg)': 175,
  'Pull Shot': 120,
  'Lofted Drive': 40,
  'Sweep': 130,
  'Defensive': 0,
};

for (const preset of presets) {
  const { engine, teams } = createMatch();
  engine.startInnings(0);
  const bowlerIdx = teams[1].players.findIndex(p => p.canBowl);
  engine.setBowler(bowlerIdx, 1);
  engine.resetFieldToPreset(preset);
  engine.autoAssignFielders(1);
  engine.setBatsman(0, 0);

  const fielders = engine.currentFielders;

  console.log(`${FIELD_PRESETS[preset]?.name} (${fielders.length} fielders):`);

  for (const [shotName, angle] of Object.entries(testAngles)) {
    let minDist = Infinity;
    let closestPos = null;
    let closestFielder = null;

    for (const fId of fielders) {
      const f = FIELD_POSITIONS[fId];
      if (!f) continue;
      const angleDiff = Math.abs(f.angle - angle);
      const normalizedDiff = angleDiff > 180 ? 360 - angleDiff : angleDiff;
      const dist = normalizedDiff / 180 + (1 - f.distance) * 0.5;
      if (dist < minDist) {
        minDist = dist;
        closestPos = f.name;
        closestFielder = f;
      }
    }

    const coverage = minDist < 0.25 ? '🔴 CLOSE' : minDist < 0.45 ? '🟡 MODERATE' : '🟢 GAP';
    const distLabel = closestFielder ? `${closestFielder.zone === 'off' ? 'off' : 'leg'} side` : '';
    console.log(`  ${shotName.padEnd(22)} → ${closestPos?.padEnd(16)} dist=${minDist.toFixed(3)} ${coverage} ${distLabel}`);
  }
  console.log();
}
