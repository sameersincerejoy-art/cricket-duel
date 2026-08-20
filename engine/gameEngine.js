// ============================================================
// GAME ENGINE — Match state management
// ============================================================

const { calculateOutcome, generateDeliveryOptions, generateShotOptions, FIELD_PRESETS, FIELD_POSITIONS } = require('./cricketEngine');

class MatchEngine {
  constructor(config = {}) {
    this.totalOvers = config.totalOvers || 2;
    this.ballsPerOver = 6;
    this.matchId = config.matchId;
    this.teams = config.teams || [null, null];
    this.currentInnings = 1; // 1 or 2
    this.currentOver = 0;
    this.currentBall = 0;
    this.score = [0, 0]; // [teamA, teamB]
    this.wickets = [0, 0];
    this.extras = [0, 0];
    this.battingOrder = [0, 1]; // which team bats first
    this.batsmanIndex = [0, 0]; // current batsman index for each innings
    this.bowlerIndex = [0, 0]; // current bowler index for each innings

    // Per-ball state
    this.currentBowler = null;
    this.currentBatsman = null;
    this.currentFieldPreset = 'balanced';
    this.currentFielders = [];
    this.deliveryOptions = [];
    this.shotOptions = [];

    // Who stands where: positionId -> player (the bowling side's fielders)
    this.fielderByPosition = {};
    this.fieldingTeamIndex = -1;
    // True once the captain has manually moved fielders — stops setBowler
    // from resetting the field to the preset every ball.
    this.fieldCustomized = false;

    // Confidence tracking
    this.batsmanConfidence = [70, 70]; // team A, team B
    this.bowlerConfidence = [70, 70];

    // Pressure
    this.pressure = 0;

    // Ball history
    this.ballHistory = [];
    this.currentOverBalls = [];

    // Match status
    this.status = 'waiting'; // waiting, toss, innings1, innings2, completed
    this.winner = null;

    // Batsman scores
    this.batsmanScores = {};

    // Bowler figures
    this.bowlerFigures = {};

    // Striker / non-striker indices
    this.strikerIndex = 0;
    this.nonStrikerIndex = 1;
  }

  // Start a new innings
  startInnings(battingTeamIndex) {
    this.currentInnings = this.currentInnings === 1 ? 1 : 2;
    this.battingOrder[this.currentInnings - 1] = battingTeamIndex;
    this.currentOver = 0;
    this.currentBall = 0;
    this.currentOverBalls = [];
    // Score/wickets/extras/confidence are keyed by TEAM index everywhere else
    // (processBall, determineWinner, getScorecard). Reset by team — resetting
    // by innings index wiped the first-innings total whenever the guest bat
    // first (battingOrder = [1, 0]).
    this.score[battingTeamIndex] = 0;
    this.wickets[battingTeamIndex] = 0;
    this.extras[battingTeamIndex] = 0;
    this.batsmanIndex[this.currentInnings - 1] = 0;
    this.bowlerIndex[this.currentInnings - 1] = 0;
    this.batsmanConfidence[battingTeamIndex] = 70;
    this.bowlerConfidence[battingTeamIndex] = 70;
    this.strikerIndex = 0;
    this.nonStrikerIndex = 1;

    // Initialize batsman scores
    const battingTeam = this.teams[battingTeamIndex];
    if (battingTeam) {
      battingTeam.players.forEach((p, i) => {
        this.batsmanScores[`${battingTeamIndex}_${i}`] = {
          runs: 0, balls: 0, fours: 0, sixes: 0, out: false, dismissal: null
        };
      });
    }

    this.status = this.currentInnings === 1 ? 'innings1' : 'innings2';
  }

  // Set bowler for current over
  setBowler(bowlerIndex, teamIndex) {
    const team = this.teams[teamIndex];
    if (!team || !team.players[bowlerIndex]) return false;
    if (!team.players[bowlerIndex].canBowl) return false; // only bowlers bowl

    this.currentBowler = team.players[bowlerIndex];
    this.currentBowlerIndex = bowlerIndex;
    this.bowlerIndex[this.currentInnings - 1] = bowlerIndex;

    // Set field — unless the captain has manually customized it
    if (!this.fieldCustomized) {
      this.currentFielders = FIELD_PRESETS[this.currentFieldPreset]?.positions || FIELD_PRESETS.balanced.positions;
    }

    // Generate delivery options
    const bowlingTeamIndex = this.battingOrder[this.currentInnings - 1] === 0 ? 1 : 0;
    this.deliveryOptions = generateDeliveryOptions(
      this.currentBowler,
      {
        over: this.currentOver,
        ballsRemaining: (this.totalOvers - this.currentOver) * 6 - this.currentBall,
        score: this.score,
        wickets: this.wickets,
        pressure: this.pressure,
      }
    );

    return true;
  }

  // Set batsman
  setBatsman(batsmanIndex, teamIndex) {
    const team = this.teams[teamIndex];
    if (!team || !team.players[batsmanIndex]) return false;

    this.currentBatsman = team.players[batsmanIndex];
    this.currentBatsmanIndex = batsmanIndex;
    return true;
  }

  // Assign the bowling team's 11 players to the 11 fielding positions.
  // Best catchers take the close-in positions (slip, gully, silly point...),
  // the rest fill the ring and the boundary.
  autoAssignFielders(teamIndex) {
    const team = this.teams[teamIndex];
    if (!team || !team.players || team.players.length !== 11) return false;

    const positions = this.currentFielders; // 11 position ids
    if (positions.length !== 11) return false;

    const fieldingScore = (p) =>
      (p.fielding?.catching || 60) + (p.fielding?.reflex || 60) + (p.fielding?.groundFielding || 60);
    const sorted = [...team.players].sort((a, b) => fieldingScore(b) - fieldingScore(a));

    // Close-in first, then the ring, then the boundary
    const order = [
      ...positions.filter(id => FIELD_POSITIONS[id]?.infield),
      ...positions.filter(id => !FIELD_POSITIONS[id]?.infield),
    ];

    this.fielderByPosition = {};
    order.forEach((posId, i) => {
      this.fielderByPosition[posId] = sorted[i] || null;
    });
    this.fieldingTeamIndex = teamIndex;
    return true;
  }

  // Move a fielder from one position to another (swap if occupied).
  // Returns the new fielder id list, or null if anything is invalid.
  setFielderPosition(fromPos, toPos) {
    const idx = this.currentFielders.indexOf(fromPos);
    if (idx === -1) return null;
    if (!FIELD_POSITIONS[toPos]) return null;

    const newFielders = [...this.currentFielders];
    const swapIdx = newFielders.indexOf(toPos);

    if (swapIdx !== -1) {
      // Swap the two fielders
      newFielders[swapIdx] = fromPos;
      newFielders[idx] = toPos;
      const playerA = this.fielderByPosition[fromPos] || null;
      const playerB = this.fielderByPosition[toPos] || null;
      this.fielderByPosition[toPos] = playerA;
      this.fielderByPosition[fromPos] = playerB;
    } else {
      // Simple move to a free position
      newFielders[idx] = toPos;
      this.fielderByPosition[toPos] = this.fielderByPosition[fromPos] || null;
      delete this.fielderByPosition[fromPos];
    }

    this.currentFielders = newFielders;
    this.fieldCustomized = true;
    return newFielders;
  }

  // Reset the field to a preset (captain chose a preset from the strip)
  resetFieldToPreset(preset) {
    this.currentFieldPreset = preset;
    this.currentFielders = FIELD_PRESETS[preset]?.positions || FIELD_PRESETS.balanced.positions;
    this.fieldCustomized = false;
    return this.currentFielders;
  }

  // Process a ball
  processBall(delivery, shot, battingTeamIndex) {
    const bowlingTeamIndex = battingTeamIndex === 0 ? 1 : 0;

    const context = {
      confidence: this.batsmanConfidence[battingTeamIndex],
      batsmanConfidence: this.batsmanConfidence[battingTeamIndex],
      bowlerConfidence: this.bowlerConfidence[bowlingTeamIndex],
      pressure: this.calculatePressure(battingTeamIndex),
      fieldersRoster: this.fielderByPosition,
      matchState: {
        score: this.score[battingTeamIndex],
        wickets: this.wickets[battingTeamIndex],
        overs: this.currentOver,
        balls: this.currentBall,
        totalOvers: this.totalOvers,
        target: this.currentInnings === 2 ? this.score[this.battingOrder[0]] + 1 : null,
      }
    };

    // Calculate outcome
    const outcome = calculateOutcome(
      delivery,
      shot,
      this.currentBowler,
      this.currentBatsman,
      this.currentFielders,
      context
    );

    // Who was on strike for this ball (before any rotation)
    const ballStrikerIndex = this.strikerIndex;

    // Update score
    if (outcome.isWide || outcome.isNoBall) {
      // Extra + any runs off the bat (e.g. no-ball + 4 = 5)
      this.score[battingTeamIndex] += outcome.runs + (outcome.extraRuns || 0);
      this.extras[battingTeamIndex] += outcome.extraRuns || 0;
    } else {
      this.score[battingTeamIndex] += outcome.runs;
    }

    // Update batsman scores
    const batsmanKey = `${battingTeamIndex}_${ballStrikerIndex}`;
    if (this.batsmanScores[batsmanKey] && !outcome.isWide) {
      // Batsman scores runs off a no-ball but doesn't face a legal delivery
      this.batsmanScores[batsmanKey].runs += outcome.runs;
      if (outcome.runs === 4) this.batsmanScores[batsmanKey].fours += 1;
      if (outcome.runs === 6) this.batsmanScores[batsmanKey].sixes += 1;
      if (!outcome.isNoBall) {
        this.batsmanScores[batsmanKey].balls += 1;
      }
    }

    // Update bowler figures
    const bowlerKey = `${bowlingTeamIndex}_${this.currentBowlerIndex}`;
    if (!this.bowlerFigures[bowlerKey]) {
      this.bowlerFigures[bowlerKey] = { overs: 0, balls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0 };
    }
    if (!outcome.isWide && !outcome.isNoBall) {
      this.bowlerFigures[bowlerKey].runs += outcome.runs;
      this.bowlerFigures[bowlerKey].balls += 1;
      if (outcome.wicket) this.bowlerFigures[bowlerKey].wickets += 1;
    } else {
      this.bowlerFigures[bowlerKey].runs += outcome.runs + (outcome.extraRuns || 0);
      if (outcome.isWide) this.bowlerFigures[bowlerKey].wides += 1;
      if (outcome.isNoBall) this.bowlerFigures[bowlerKey].noBalls += 1;
    }

    // Handle wicket
    if (outcome.wicket) {
      this.wickets[battingTeamIndex] += 1;
      if (this.batsmanScores[batsmanKey]) {
        this.batsmanScores[batsmanKey].out = true;
        this.batsmanScores[batsmanKey].dismissal = outcome.wicketType;
      }

      // New batsman comes in at the striker's end; non-striker keeps their end
      const next = this.findNextBatsman(battingTeamIndex, this.strikerIndex);
      if (next >= 0) {
        this.strikerIndex = next;
        this.setBatsman(next, battingTeamIndex);
      }
    } else if (outcome.runs % 2 === 1) {
      // Odd runs = rotate strike
      [this.strikerIndex, this.nonStrikerIndex] = [this.nonStrikerIndex, this.strikerIndex];
    }

    // Update confidence
    this.updateConfidence(battingTeamIndex, bowlingTeamIndex, outcome);

    // Record ball
    const ballRecord = {
      innings: this.currentInnings,
      over: this.currentOver,
      ball: this.currentBall,
      delivery,
      shot,
      outcome,
      batsmanIndex: ballStrikerIndex,
      bowlerIndex: this.currentBowlerIndex,
      score: this.score[battingTeamIndex],
      wickets: this.wickets[battingTeamIndex],
    };

    this.ballHistory.push(ballRecord);
    this.currentOverBalls.push(ballRecord);

    // Increment ball (unless wide/no-ball)
    if (!outcome.isWide && !outcome.isNoBall) {
      this.currentBall += 1;
    }

    // Check if innings is over
    const inningsComplete = this.isInningsComplete(battingTeamIndex);

    // Check if match is over
    let matchResult = null;
    if (this.currentInnings === 2 && inningsComplete) {
      matchResult = this.determineWinner();
      this.status = 'completed';
      this.winner = matchResult.winner;
    }

    return {
      outcome,
      ballRecord,
      inningsComplete,
      matchResult,
      newOver: this.currentBall >= this.ballsPerOver,
    };
  }

  // Max overs any bowler may bowl in this match (design doc point 45)
  getBowlerMaxOvers() {
    return Math.max(1, Math.ceil(this.totalOvers / 3));
  }

  // Legal overs already bowled by a player
  getBowlerOversBowled(teamIndex, playerIndex) {
    const key = `${teamIndex}_${playerIndex}`;
    const f = this.bowlerFigures[key];
    if (!f) return 0;
    return Math.floor(f.balls / 6);
  }

  findNextBatsman(teamIndex, excludeIndex) {
    const team = this.teams[teamIndex];
    if (!team) return -1;

    for (let i = 0; i < team.players.length; i++) {
      if (i === excludeIndex) continue;
      const key = `${teamIndex}_${i}`;
      if (this.batsmanScores[key] && !this.batsmanScores[key].out) {
        return i;
      }
    }
    return -1; // All out
  }

  isInningsComplete(battingTeamIndex) {
    const team = this.teams[battingTeamIndex];
    const allOut = this.wickets[battingTeamIndex] >= (team?.players.length || 11) - 1;

    // Overs complete: the final legal ball of the last over has been bowled.
    // `currentOver` is 0-indexed and only increments in startNewOver, so the last
    // over is currentOver === totalOvers - 1 and it finishes when currentBall hits 6.
    const oversComplete =
      this.currentOver >= this.totalOvers ||
      (this.currentOver === this.totalOvers - 1 && this.currentBall >= this.ballsPerOver);

    // Innings 2: chase completed when the target is passed
    let targetReached = false;
    if (this.currentInnings === 2) {
      const target = this.score[this.battingOrder[0]] + 1;
      targetReached = this.score[battingTeamIndex] >= target;
    }

    return allOut || oversComplete || targetReached;
  }

  startNewOver() {
    this.currentOver += 1;
    this.currentBall = 0;
    this.currentOverBalls = [];

    if (this.currentOver >= this.totalOvers) {
      return { inningsComplete: true };
    }

    return { inningsComplete: false };
  }

  updateConfidence(battingTeamIndex, bowlingTeamIndex, outcome) {
    // Batting confidence
    if (outcome.wicket) {
      this.batsmanConfidence[battingTeamIndex] = Math.max(20, this.batsmanConfidence[battingTeamIndex] - 15);
    } else if (outcome.runs >= 4) {
      this.batsmanConfidence[battingTeamIndex] = Math.min(95, this.batsmanConfidence[battingTeamIndex] + 8);
    } else if (outcome.runs >= 1) {
      this.batsmanConfidence[battingTeamIndex] = Math.min(95, this.batsmanConfidence[battingTeamIndex] + 2);
    } else {
      this.batsmanConfidence[battingTeamIndex] = Math.max(20, this.batsmanConfidence[battingTeamIndex] - 3);
    }

    // Bowling confidence
    if (outcome.wicket) {
      this.bowlerConfidence[bowlingTeamIndex] = Math.min(95, this.bowlerConfidence[bowlingTeamIndex] + 10);
    } else if (outcome.runs >= 4) {
      this.bowlerConfidence[bowlingTeamIndex] = Math.max(20, this.bowlerConfidence[bowlingTeamIndex] - 8);
    } else if (outcome.runs === 0) {
      this.bowlerConfidence[bowlingTeamIndex] = Math.min(95, this.bowlerConfidence[bowlingTeamIndex] + 3);
    } else {
      this.bowlerConfidence[bowlingTeamIndex] = Math.max(20, this.bowlerConfidence[bowlingTeamIndex] - 2);
    }
  }

  calculatePressure(battingTeamIndex) {
    if (this.currentInnings !== 2) return 0;

    const target = this.score[this.battingOrder[0]] + 1;
    const currentScore = this.score[battingTeamIndex];
    const ballsRemaining = (this.totalOvers - this.currentOver) * 6 - this.currentBall;
    const runsNeeded = target - currentScore;
    const rrr = ballsRemaining > 0 ? (runsNeeded / ballsRemaining) * 6 : 99;

    // Pressure increases with required run rate and decreases with balls remaining
    let pressure = 0;
    if (rrr > 12) pressure += 80;
    else if (rrr > 10) pressure += 60;
    else if (rrr > 8) pressure += 40;
    else if (rrr > 6) pressure += 20;
    else pressure += 10;

    // Fewer balls = more pressure
    if (ballsRemaining <= 6) pressure += 20;
    else if (ballsRemaining <= 12) pressure += 10;

    this.pressure = Math.min(100, pressure);
    return this.pressure;
  }

  determineWinner() {
    const team1Score = this.score[this.battingOrder[0]];
    const team2Score = this.score[this.battingOrder[1]];

    if (team2Score > team1Score) {
      return { winner: this.battingOrder[1], margin: team2Score - team1Score, type: 'runs' };
    } else if (team1Score > team2Score) {
      // Team batting first wins: margin is wickets remaining for the chasing team
      const wicketsLeft = (this.teams[this.battingOrder[1]]?.players.length || 11) - 1 - this.wickets[this.battingOrder[1]];
      return { winner: this.battingOrder[0], margin: Math.max(0, wicketsLeft), type: 'wickets' };
    } else {
      return { winner: null, margin: 0, type: 'tie' };
    }
  }

  // Get match state for a specific team
  getStateForTeam(teamIndex) {
    return {
      matchId: this.matchId,
      status: this.status,
      currentInnings: this.currentInnings,
      currentOver: this.currentOver,
      currentBall: this.currentBall,
      score: this.score[teamIndex],
      wickets: this.wickets[teamIndex],
      totalOvers: this.totalOvers,
      extras: this.extras[teamIndex],
      confidence: this.batsmanConfidence[teamIndex],
      bowlerConfidence: this.bowlerConfidence[teamIndex],
      pressure: this.pressure,
      strikerIndex: this.strikerIndex,
      nonStrikerIndex: this.nonStrikerIndex,
      currentBowler: this.currentBowler ? {
        name: this.currentBowler.name,
        type: this.currentBowler.type,
      } : null,
      currentBatsman: this.currentBatsman ? {
        name: this.currentBatsman.name,
        role: this.currentBatsman.role,
      } : null,
      fieldPreset: this.currentFieldPreset,
      fielders: this.currentFielders,
      ballHistory: this.ballHistory.slice(-10),
      currentOverBalls: this.currentOverBalls,
      battingTeam: this.teams[this.currentInnings === 1 ? this.battingOrder[0] : this.battingOrder[1]]?.name,
      bowlingTeam: this.teams[this.currentInnings === 1 ? this.battingOrder[1] : this.battingOrder[0]]?.name,
      target: this.currentInnings === 2 ? this.score[this.battingOrder[0]] + 1 : null,
      batsmanScores: this.getBatsmanScoresForTeam(this.currentInnings === 1 ? this.battingOrder[0] : this.battingOrder[1]),
      bowlerFigures: this.getBowlerFiguresForTeam(this.currentInnings === 1 ? this.battingOrder[1] : this.battingOrder[0]),
      winner: this.winner,
      matchResult: this.status === 'completed' ? this.determineWinner() : null,
    };
  }

  getBatsmanScoresForTeam(teamIndex) {
    const scores = [];
    const team = this.teams[teamIndex];
    if (!team) return scores;

    team.players.forEach((player, i) => {
      const key = `${teamIndex}_${i}`;
      if (this.batsmanScores[key]) {
        scores.push({
          name: player.name,
          role: player.role,
          ...this.batsmanScores[key],
          sr: this.batsmanScores[key].balls > 0
            ? ((this.batsmanScores[key].runs / this.batsmanScores[key].balls) * 100).toFixed(1)
            : '0.0',
        });
      }
    });

    return scores;
  }

  getBowlerFiguresForTeam(teamIndex) {
    const figures = [];
    const team = this.teams[teamIndex];
    if (!team) return figures;

    team.players.forEach((player, i) => {
      if (player.canBowl) {
        const key = `${teamIndex}_${i}`;
        const f = this.bowlerFigures[key] || { overs: 0, balls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0 };
        const oversBowled = Math.floor(f.balls / 6);
        const extraBalls = f.balls % 6;
        const oversStr = extraBalls > 0 ? `${oversBowled}.${extraBalls}` : `${oversBowled}`;
        const econ = f.balls > 0 ? ((f.runs / f.balls) * 6).toFixed(2) : '0.00';

        figures.push({
          name: player.name,
          type: player.type,
          overs: oversStr,
          runs: f.runs,
          wickets: f.wickets,
          economy: econ,
          wides: f.wides,
          noBalls: f.noBalls,
        });
      }
    });

    return figures;
  }

  getScorecard() {
    return {
      team1: {
        name: this.teams[0]?.name,
        score: this.score[0],
        wickets: this.wickets[0],
        overs: this.getOversBowled(0),
        extras: this.extras[0],
        batsman: this.getBatsmanScoresForTeam(0),
        bowlers: this.getBowlerFiguresForTeam(0),
      },
      team2: {
        name: this.teams[1]?.name,
        score: this.score[1],
        wickets: this.wickets[1],
        overs: this.getOversBowled(1),
        extras: this.extras[1],
        batsman: this.getBatsmanScoresForTeam(1),
        bowlers: this.getBowlerFiguresForTeam(1),
      },
      result: this.status === 'completed' ? this.determineWinner() : null,
    };
  }

  getOversBowled(teamIndex) {
    // Count legal balls bowled against this team (across the innings where they batted)
    let balls = 0;
    for (const ball of this.ballHistory) {
      const inningsBattingTeam = this.battingOrder[ball.innings - 1];
      if (inningsBattingTeam === teamIndex && !ball.outcome.isWide && !ball.outcome.isNoBall) {
        balls++;
      }
    }
    const overs = Math.floor(balls / 6);
    const extra = balls % 6;
    return extra > 0 ? `${overs}.${extra}` : `${overs}`;
  }
}

module.exports = { MatchEngine };
