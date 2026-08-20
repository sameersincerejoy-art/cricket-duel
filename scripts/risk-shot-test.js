// ============================================================
// RISK SHOT TEST — Bowler bowls 1 over, batsman picks the
// highest-risk shot on every delivery. Shows results + summary.
// ============================================================

const { generateAutoTeam } = require('../engine/autoTeam');
const { MatchEngine } = require('../engine/gameEngine');
const { FIELD_PRESETS, calculateOutcome, generateShotOptions, SHOT_TYPES } = require('../engine/cricketEngine');

const usedNames = new Set();
const teams = [generateAutoTeam(0, 72, usedNames), generateAutoTeam(1, 72, usedNames)];

const engine = new MatchEngine({ matchId: 'RISK', totalOvers: 2, teams });
engine.battingOrder = [0, 1];
engine.startInnings(0);

const battingTeam = 0;
const bowlingTeam = 1;

// Pick a bowler
const bowlerIdx = teams[bowlingTeam].players.findIndex(p => p.canBowl);
engine.setBowler(bowlerIdx, bowlingTeam);

// Pick a batsman
engine.setBatsman(0, battingTeam);
engine.resetFieldToPreset('balanced');
engine.autoAssignFielders(bowlingTeam);

const batsman = engine.currentBatsman;
const bowler = engine.currentBowler;

console.log(`\n🏏 RISK SHOT TEST — 1 over\n`);
console.log(`Batsman: ${batsman.name} (${batsman.handed}-handed)`);
console.log(`Bowler:  ${bowler.name} (${bowler.type})`);
console.log(`\n${'─'.repeat(70)}`);
console.log(`${'Ball'.padEnd(5)} ${'Delivery'.padEnd(20)} ${'Shot'.padEnd(22)} ${'Runs'.padEnd(5)} ${'Wicket'.padEnd(8)} Description`);
console.log(`${'─'.repeat(70)}`);

let totalRuns = 0;
let totalWickets = 0;
let legalBalls = 0;
const results = [];

for (let ball = 0; ball < 6; ) {
  // Pick a delivery — first option offered by engine
  const delivery = engine.deliveryOptions[0];

  // Get shot options and pick the HIGHEST RISK one
  const shotOptions = generateShotOptions(batsman, delivery);
  const riskiest = [...shotOptions].sort((a, b) => {
    const riskA = SHOT_TYPES[a.type]?.risk || 0;
    const riskB = SHOT_TYPES[b.type]?.risk || 0;
    return riskB - riskA;
  })[0];

  const riskVal = (SHOT_TYPES[riskiest.type]?.risk || 0).toFixed(2);

  // Process the ball
  const result = engine.processBall(delivery, riskiest, battingTeam);
  const outcome = result.outcome;

  // Count legal balls
  if (!outcome.isWide && !outcome.isNoBall) {
    legalBalls++;
    ball++;
  }

  totalRuns += outcome.runs;
  if (outcome.wicket) totalWickets++;

  const deliveryName = `${delivery.type} (${delivery.line})`;
  const shotName = `${riskiest.type} [${riskVal}]`;
  const runsStr = outcome.isWide ? `${outcome.runs}+1Wd` :
                  outcome.isNoBall ? `${outcome.runs}+1Nb` :
                  String(outcome.runs);
  const wicketStr = outcome.wicket ? '✅ OUT' : '';

  console.log(
    `${String(legalBalls).padEnd(5)} ` +
    `${deliveryName.padEnd(20)} ` +
    `${shotName.padEnd(22)} ` +
    `${runsStr.padEnd(5)} ` +
    `${wicketStr.padEnd(8)} ` +
    `${outcome.description || ''}`
  );

  results.push({
    ball: legalBalls,
    delivery: deliveryName,
    shot: shotName,
    runs: outcome.runs,
    wicket: outcome.wicket,
    isWide: outcome.isWide,
    isNoBall: outcome.isNoBall,
  });

  // Start new over if needed
  if (result.newOver) {
    engine.startNewOver();
    engine.setBowler(bowlerIdx, bowlingTeam);
    engine.setBatsman(engine.currentBatsmanIndex, battingTeam);
  }
}

console.log(`${'─'.repeat(70)}`);
console.log(`\n📊 SUMMARY`);
console.log(`   Runs conceded: ${totalRuns}`);
console.log(`   Wickets taken: ${totalWickets}`);
console.log(`   Legal balls:   ${legalBalls}`);
console.log(`   Run rate:      ${(totalRuns / (legalBalls / 6)).toFixed(2)}`);
console.log(`   Dots:          ${results.filter(r => r.runs === 0 && !r.isWide && !r.isNoBall).length}`);
console.log(`   Fours:         ${results.filter(r => r.runs === 4).length}`);
console.log(`   Sixes:         ${results.filter(r => r.runs === 6).length}`);
console.log(`   Extras:        ${results.filter(r => r.isWide || r.isNoBall).length}`);
console.log(`\n   Total score: ${engine.score[battingTeam]}/${engine.wickets[battingTeam]}`);
console.log(`   Batsman: ${batsman.name} — ${engine.batsmanScores[`${battingTeam}_0`]?.runs || 0}(${engine.batsmanScores[`${battingTeam}_0`]?.balls || 0})`);
