// ============================================================
// AUTO TEAM GENERATOR — Creates balanced fictional teams
const { BOWLER_TYPES } = require('./cricketEngine');
//
// Player names are recognizable-but-fictional versions of real
// cricketers (e.g. "N.S. Dhoni" for M.S. Dhoni) grouped by the
// role the real player actually plays — so a Dhoni is always a
// wicketkeeper, a Bumrah always a fast bowler, a Kohli always a
// top-order batter. No more awkward random combos like "Virat
// Sharma" with a bowler's body.
// ============================================================

// Name pools per role. Each entry keeps the real player's surname
// (recognizable) but changes the initials so it is clearly a
// fictional player. The role matches the original cricketer.
const NAME_POOLS = {
  opener: ['A. Gill', 'Y. Jaiswal', 'H. Sharma', 'L. Rahul', 'S. Shaw', 'T. Gaikwad', 'P. de Kock', 'M. Warner', 'K. Azam', 'F. Zaman', 'B. Dhawan', 'C. Bairstow'],
  topOrder: ['R. Kohli', 'A. Iyer', 'D. Pujara', 'M. Rahane', 'J. Smith', 'T. Williamson', 'H. Root', 'K. Babar', 'V. Pandey', 'N. Vihari'],
  middleOrder: ['K. Yadav', 'V. Kishan', 'R. Padikkal', 'J. Brook', 'L. Livingstone', 'G. Marsh', 'S. Hetmyer', 'P. Pooran', 'A. Markram', 'D. van der Merwe'],
  finisher: ['B. Pandya', 'C. Russell', 'E. Miller', 'F. David', 'G. Pollard', 'H. Philips', 'I. Stoinis', 'J. Billings'],
  wicketkeeper: ['N.S. Dhoni', 'S. Pant', 'T. Buttler', 'Q. Rizwan', 'P. Samson', 'R. Conway', 'O. Bairstow', 'U. Kishan'],
  fastBowler: ['K. Bumrah', 'N. Siraj', 'R. Shami', 'A. Malik', 'P. Boult', 'C. Archer', 'D. Cummins', 'T. Starc', 'L. Rabada', 'J. Nortje', 'W. Ferguson', 'E. Afridi', 'Z. Naseem', 'X. Henry'],
  swingBowler: ['B. Kumar', 'M. Anderson', 'S. Southee', 'D. Willey', 'F. Boult'],
  spinBowler: ['S. Ashwin', 'M. Rashid', 'B. Sundar', 'C. Chahal', 'G. Maharaj', 'R. Hasaranga', 'T. Shamsi', 'V. Khan'],
  battingAllRounder: ['K. Pandya', 'R. Stokes', 'D. Maxwell', 'H. Ali', 'T. Curran', 'N. Marsh', 'W. Livingstone'],
  bowlingAllRounder: ['S. Jadeja', 'M. Patel', 'J. Green', 'K. Russell', 'A. Narine', 'C. Woakes', 'B. Stokes'],
};

const TEAM_NAMES = [
  'Mumbai Mavericks', 'Delhi Dynamos', 'Chennai Champions', 'Kolkata Kings',
  'Bangalore Blasters', 'Hyderabad Hawks', 'Punjab Panthers', 'Rajasthan Royals',
  'Lions', 'Tigers', 'Eagles', 'Warriors', 'Knights', 'Riders',
  'Strikers', 'Thunder', 'Superstars', 'Legends', 'United', 'Phoenix',
  'Stallions', 'Cobras', 'Vipers', 'Sharks', 'Wolves', 'Storm',
];

const TEAM_SHORT_NAMES = [
  'MUM', 'DEL', 'CHE', 'KOL', 'BLR', 'HYD', 'PUN', 'RAJ',
  'LIO', 'TIG', 'EAG', 'WAR', 'KNR', 'RDR', 'STR', 'THU',
  'SUP', 'LEG', 'UNI', 'PHX', 'STA', 'COB', 'VIP', 'SHK', 'WLV', 'STM',
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Pick a distinct name for a role. `usedNames` is a shared Set so
// no player name appears twice within a team OR across the two teams.
function generatePlayerName(role, usedNames) {
  const pool = NAME_POOLS[role] || ['A. Player'];
  const candidates = shuffle(pool.filter(n => !usedNames.has(n)));
  const name = candidates[0] || randomChoice(pool);
  usedNames.add(name);
  return name;
}

function generateBatsmanAttributes(quality) {
  // quality: 1-100, affects overall skill level
  const base = quality + randomInt(-10, 10);
  return {
    timing: Math.max(40, Math.min(99, base + randomInt(-5, 5))),
    technique: Math.max(40, Math.min(99, base + randomInt(-8, 5))),
    power: Math.max(40, Math.min(99, base + randomInt(-5, 8))),
    paceHandling: Math.max(40, Math.min(99, base + randomInt(-10, 5))),
    spinHandling: Math.max(40, Math.min(99, base + randomInt(-10, 5))),
    shortBall: Math.max(40, Math.min(99, base + randomInt(-10, 5))),
    yorker: Math.max(40, Math.min(99, base + randomInt(-10, 5))),
    swingBall: Math.max(40, Math.min(99, base + randomInt(-8, 5))),
    pressureHandling: Math.max(40, Math.min(99, base + randomInt(-8, 5))),
    mentalStrength: Math.max(40, Math.min(99, base + randomInt(-8, 5))),
  };
}

function generateBowlerAttributes(quality) {
  const base = quality + randomInt(-10, 10);
  return {
    pace: Math.max(40, Math.min(99, base + randomInt(-5, 5))),
    accuracy: Math.max(40, Math.min(99, base + randomInt(-8, 5))),
    swing: Math.max(40, Math.min(99, base + randomInt(-10, 5))),
    seam: Math.max(40, Math.min(99, base + randomInt(-10, 5))),
    bounce: Math.max(40, Math.min(99, base + randomInt(-8, 5))),
    yorker: Math.max(40, Math.min(99, base + randomInt(-5, 5))),
    bouncer: Math.max(40, Math.min(99, base + randomInt(-8, 5))),
    variation: Math.max(40, Math.min(99, base + randomInt(-8, 5))),
    control: Math.max(40, Math.min(99, base + randomInt(-5, 5))),
    spin: Math.max(40, Math.min(99, base + randomInt(-10, 5))),
    mentalStrength: Math.max(40, Math.min(99, base + randomInt(-8, 5))),
  };
}

function generateFieldingAttributes() {
  return {
    catching: randomInt(50, 90),
    reflex: randomInt(50, 90),
    throwing: randomInt(50, 90),
    groundFielding: randomInt(50, 90),
    armStrength: randomInt(50, 90),
    reactionTime: randomInt(50, 90),
  };
}

// Bowling styles: every real type (design doc point 22). A fast bowler can
// only be fast; a spinner can only spin; all-rounders are medium pacers.
const BOWLING_TYPES_BY_ROLE = {
  fastBowler: ['right_arm_fast', 'left_arm_fast', 'right_arm_fast_medium', 'left_arm_fast_medium'],
  swingBowler: ['right_arm_fast_medium', 'left_arm_fast_medium'],
  spinBowler: ['right_arm_off_spin', 'right_arm_leg_spin', 'slow_left_arm_orthodox', 'left_arm_wrist_spin'],
  legSpinner: ['right_arm_leg_spin', 'left_arm_wrist_spin'],
  offSpinner: ['right_arm_off_spin', 'slow_left_arm_orthodox'],
  battingAllRounder: ['right_arm_medium', 'left_arm_medium'],
  bowlingAllRounder: ['right_arm_medium', 'left_arm_medium'],
};

const ROLES = {
  opener: { batting: true, bowling: false, canBowl: false },
  topOrder: { batting: true, bowling: false, canBowl: false },
  middleOrder: { batting: true, bowling: false, canBowl: false },
  finisher: { batting: true, bowling: false, canBowl: false },
  wicketkeeper: { batting: true, bowling: false, canBowl: false },
  fastBowler: { batting: false, bowling: true, canBowl: true },
  swingBowler: { batting: false, bowling: true, canBowl: true },
  spinBowler: { batting: false, bowling: true, canBowl: true },
  legSpinner: { batting: false, bowling: true, canBowl: true },
  offSpinner: { batting: false, bowling: true, canBowl: true },
  battingAllRounder: { batting: true, bowling: true, canBowl: true },
  bowlingAllRounder: { batting: true, bowling: true, canBowl: true },
};

function generateAutoTeam(teamIndex, quality = 72, usedNames = null) {
  const used = usedNames || new Set();

  const teamTemplate = [
    { role: 'opener', name: 'Opener 1', qualityMod: 5 },
    { role: 'opener', name: 'Opener 2', qualityMod: 5 },
    { role: 'topOrder', name: 'Top Order', qualityMod: 3 },
    { role: 'battingAllRounder', name: 'Batting All-Rounder', qualityMod: 0 },
    { role: 'middleOrder', name: 'Middle Order', qualityMod: -3 },
    { role: 'wicketkeeper', name: 'Wicketkeeper', qualityMod: 0 },
    { role: 'bowlingAllRounder', name: 'Bowling All-Rounder', qualityMod: -2 },
    { role: 'fastBowler', name: 'Fast Bowler 1', qualityMod: -5 },
    { role: 'fastBowler', name: 'Fast Bowler 2', qualityMod: -5 },
    { role: 'spinBowler', name: 'Spinner', qualityMod: -3 },
    { role: 'fastBowler', name: 'Fast Bowler 3', qualityMod: -7 },
  ];

  const players = teamTemplate.map((template, index) => {
    const playerQuality = quality + template.qualityMod;
    const role = ROLES[template.role];
    const name = generatePlayerName(template.role, used);

    const player = {
      id: `p${teamIndex}_${index}`,
      name,
      role: template.role,
      roleName: template.name,
      canBowl: role.canBowl,
      bowlingType: role.bowlingType || null,
      batting: role.batting ? generateBatsmanAttributes(playerQuality) : null,
      bowling: role.bowling ? generateBowlerAttributes(playerQuality) : null,
      fielding: generateFieldingAttributes(),
      personality: {
        aggression: randomInt(30, 90),
        patience: randomInt(30, 90),
        riskAppetite: randomInt(30, 90),
        pressureHandling: randomInt(40, 90),
        tacticalIntelligence: randomInt(40, 90),
        adaptability: randomInt(40, 90),
      },
      confidence: 70,
      // ~20% of batsmen are left-handed (realistic cricket ratio)
      // Only batting roles and all-rounders need a meaningful handed;
      // pure bowlers default to 'right' since it mainly affects field view.
      handed: role.batting ? (Math.random() < 0.20 ? 'left' : 'right') : 'right',
    };

    // Set the bowling 'type' field for the engine — picked from the role's
    // real bowling styles (a Dhoni is never a spinner's role etc.)
    if (role.canBowl) {
      const styles = BOWLING_TYPES_BY_ROLE[template.role] || ['right_arm_medium'];
      player.type = randomChoice(styles);
      player.typeName = BOWLER_TYPES[player.type]?.name || player.type;
    }

    // Set batting attributes at top level for engine access
    if (player.batting) {
      Object.assign(player, player.batting);
    }
    if (player.bowling) {
      Object.assign(player, player.bowling);
    }

    return player;
  });

  // Team names: team 0 picks any name; team 1 must not repeat it
  // (tracked through the same shared `used` set as player names).
  const teamOptions = TEAM_NAMES.filter(n => !used.has(`team:${n}`));
  const teamName = teamOptions[Math.floor(Math.random() * teamOptions.length)] || randomChoice(TEAM_NAMES);
  used.add(`team:${teamName}`);
  const shortOptions = TEAM_SHORT_NAMES.filter(n => !used.has(`short:${n}`));
  const shortName = shortOptions[Math.floor(Math.random() * shortOptions.length)] || randomChoice(TEAM_SHORT_NAMES);
  used.add(`short:${shortName}`);

  return {
    name: teamName,
    shortName,
    players,
  };
}

module.exports = { generateAutoTeam };
