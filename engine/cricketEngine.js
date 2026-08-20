// ============================================================
// CRICKET ENGINE — The core simulation logic
// Every outcome must be explainable by cricket logic
// ============================================================

// --- DELIVERY TYPES ---
// `defaultSpeed` is the internal execution speed of each delivery — the
// bowler now chooses ONLY type + line (design doc: length is implied by the
// delivery type, so the separate length/speed choice is gone).
const DELIVERY_TYPES = {
  // Fast bowling
  yorker: { id: 'yorker', name: 'Yorker', category: 'length', speed: 'fast', defaultSpeed: 'fast' },
  good_length: { id: 'good_length', name: 'Good Length', category: 'length', speed: 'fast', defaultSpeed: 'fast' },
  short: { id: 'short', name: 'Short Ball', category: 'length', speed: 'fast', defaultSpeed: 'fast' },
  bouncer: { id: 'bouncer', name: 'Bouncer', category: 'length', speed: 'fast', defaultSpeed: 'maximum' },
  full_tos: { id: 'full_tos', name: 'Full Toss', category: 'length', speed: 'fast', defaultSpeed: 'fast' },
  // Variations — the high-risk/high-reward stuff (design doc point 20-24).
  // Each is marked with `risk`: a mis-executed variation is a free hit, but
  // one that comes off beats the bat and takes the wicket.
  slower_ball: { id: 'slower_ball', name: 'Slower Ball', category: 'variation', speed: 'change', defaultSpeed: 'change', risk: 0.22 },
  slower_yorker: { id: 'slower_yorker', name: 'Slower Yorker', category: 'variation', speed: 'change', defaultSpeed: 'change', risk: 0.34 },
  knuckle_ball: { id: 'knuckle_ball', name: 'Knuckle Ball', category: 'variation', speed: 'change', defaultSpeed: 'change', risk: 0.30 },
  leg_cutter: { id: 'leg_cutter', name: 'Leg Cutter', category: 'variation', speed: 'fast', defaultSpeed: 'fast', risk: 0.22 },
  off_cutter: { id: 'off_cutter', name: 'Off Cutter', category: 'variation', speed: 'fast', defaultSpeed: 'fast', risk: 0.22 },
  reverse_swing: { id: 'reverse_swing', name: 'Reverse Swing', category: 'variation', speed: 'fast', defaultSpeed: 'fast', risk: 0.26 },
  wide_yorker: { id: 'wide_yorker', name: 'Wide Yorker', category: 'variation', speed: 'fast', defaultSpeed: 'fast', risk: 0.20 },
  // Spin — variations included
  off_break: { id: 'off_break', name: 'Off Break', category: 'spin', speed: 'spin', defaultSpeed: 'spin_fast', risk: 0.08 },
  leg_break: { id: 'leg_break', name: 'Leg Break', category: 'spin', speed: 'spin', defaultSpeed: 'spin_fast', risk: 0.10 },
  googly: { id: 'googly', name: 'Googly', category: 'spin', speed: 'spin', defaultSpeed: 'spin_fast', risk: 0.26 },
  flipper: { id: 'flipper', name: 'Flipper', category: 'spin', speed: 'spin', defaultSpeed: 'spin_max', risk: 0.28 },
  topspin: { id: 'topspin', name: 'Top Spinner', category: 'spin', speed: 'spin', defaultSpeed: 'spin_fast', risk: 0.18 },
  carrom: { id: 'carrom', name: 'Carrom Ball', category: 'spin', speed: 'spin', defaultSpeed: 'spin_fast', risk: 0.24 },
  doosra: { id: 'doosra', name: 'Doosra', category: 'spin', speed: 'spin', defaultSpeed: 'spin_fast', risk: 0.30 },
  teesra: { id: 'teesra', name: 'Teesra', category: 'spin', speed: 'spin', defaultSpeed: 'spin_fast', risk: 0.28 },
  // The left-arm orthodox stock ball that skids straight on with the arm
  arm_ball: { id: 'arm_ball', name: 'Arm Ball', category: 'spin', speed: 'spin', defaultSpeed: 'spin_slow', risk: 0.16 },
};

// --- BOWLER TYPES (design doc point 22, expanded) ---
// Every real bowling style, each with the delivery library a cricketer of
// that type can actually bowl. A fast bowler can never bowl an off break;
// an off spinner can never bowl a bouncer. Each delivery maps to the lines
// that make cricketing sense for it (an off break is aimed at off/stumps
// because it turns INTO the right-hander; a leg break at leg/stumps because
// it turns AWAY; a bouncer at the body). `skill` = which bowler attribute
// drives how often the delivery is offered; `weight` = copies at skill 100.
const BOWLER_TYPES = {
  right_arm_fast: {
    id: 'right_arm_fast', name: 'Right-Arm Fast', arm: 'right', category: 'pace',
    deliveries: {
      good_length: { lines: ['off', 'stumps', 'leg'], skill: 'accuracy', weight: 0.07 },
      yorker: { lines: ['stumps', 'off', 'leg'], skill: 'yorker', weight: 0.055 },
      wide_yorker: { lines: ['wide_off'], skill: 'yorker', weight: 0.028 },
      short: { lines: ['leg', 'stumps'], skill: 'bouncer', weight: 0.05 },
      bouncer: { lines: ['leg'], skill: 'bouncer', weight: 0.03 },
      slower_ball: { lines: ['stumps', 'off'], skill: 'variation', weight: 0.04 },
      slower_yorker: { lines: ['stumps', 'off'], skill: 'variation', weight: 0.02 },
      knuckle_ball: { lines: ['stumps', 'off'], skill: 'variation', weight: 0.022 },
      leg_cutter: { lines: ['leg', 'stumps'], skill: 'seam', weight: 0.022 },
      off_cutter: { lines: ['off', 'stumps'], skill: 'seam', weight: 0.022 },
      reverse_swing: { lines: ['stumps', 'off'], skill: 'swing', weight: 0.022 },
      full_tos: { lines: ['stumps', 'leg'], skill: 'variation', weight: 0.02 },
    },
  },
  left_arm_fast: {
    id: 'left_arm_fast', name: 'Left-Arm Fast', arm: 'left', category: 'pace',
    deliveries: {
      good_length: { lines: ['off', 'stumps', 'leg'], skill: 'accuracy', weight: 0.07 },
      yorker: { lines: ['stumps', 'off', 'leg'], skill: 'yorker', weight: 0.055 },
      wide_yorker: { lines: ['wide_off'], skill: 'yorker', weight: 0.028 },
      short: { lines: ['leg', 'stumps'], skill: 'bouncer', weight: 0.05 },
      bouncer: { lines: ['leg'], skill: 'bouncer', weight: 0.03 },
      slower_ball: { lines: ['stumps', 'off'], skill: 'variation', weight: 0.04 },
      slower_yorker: { lines: ['stumps', 'off'], skill: 'variation', weight: 0.02 },
      knuckle_ball: { lines: ['stumps', 'off'], skill: 'variation', weight: 0.022 },
      leg_cutter: { lines: ['leg', 'stumps'], skill: 'seam', weight: 0.022 },
      off_cutter: { lines: ['off', 'stumps'], skill: 'seam', weight: 0.022 },
      reverse_swing: { lines: ['stumps', 'off'], skill: 'swing', weight: 0.026 },
      full_tos: { lines: ['stumps', 'leg'], skill: 'variation', weight: 0.02 },
    },
  },
  right_arm_fast_medium: {
    id: 'right_arm_fast_medium', name: 'Right-Arm Fast-Medium', arm: 'right', category: 'pace',
    deliveries: {
      good_length: { lines: ['off', 'stumps', 'leg'], skill: 'accuracy', weight: 0.09 },
      yorker: { lines: ['stumps', 'off', 'leg'], skill: 'yorker', weight: 0.045 },
      wide_yorker: { lines: ['wide_off'], skill: 'yorker', weight: 0.024 },
      slower_ball: { lines: ['stumps', 'off'], skill: 'variation', weight: 0.05 },
      knuckle_ball: { lines: ['stumps'], skill: 'variation', weight: 0.025 },
      leg_cutter: { lines: ['leg', 'stumps'], skill: 'seam', weight: 0.03 },
      off_cutter: { lines: ['off', 'stumps'], skill: 'seam', weight: 0.03 },
      short: { lines: ['leg', 'stumps'], skill: 'bouncer', weight: 0.035 },
      reverse_swing: { lines: ['stumps', 'off'], skill: 'swing', weight: 0.026 },
      full_tos: { lines: ['stumps'], skill: 'variation', weight: 0.02 },
    },
  },
  left_arm_fast_medium: {
    id: 'left_arm_fast_medium', name: 'Left-Arm Fast-Medium', arm: 'left', category: 'pace',
    deliveries: {
      good_length: { lines: ['off', 'stumps', 'leg'], skill: 'accuracy', weight: 0.09 },
      yorker: { lines: ['stumps', 'off', 'leg'], skill: 'yorker', weight: 0.045 },
      wide_yorker: { lines: ['wide_off'], skill: 'yorker', weight: 0.024 },
      slower_ball: { lines: ['stumps', 'off'], skill: 'variation', weight: 0.05 },
      knuckle_ball: { lines: ['stumps'], skill: 'variation', weight: 0.025 },
      leg_cutter: { lines: ['leg', 'stumps'], skill: 'seam', weight: 0.03 },
      off_cutter: { lines: ['off', 'stumps'], skill: 'seam', weight: 0.03 },
      short: { lines: ['leg', 'stumps'], skill: 'bouncer', weight: 0.035 },
      reverse_swing: { lines: ['stumps', 'off'], skill: 'swing', weight: 0.03 },
      full_tos: { lines: ['stumps'], skill: 'variation', weight: 0.02 },
    },
  },
  right_arm_medium: {
    id: 'right_arm_medium', name: 'Right-Arm Medium', arm: 'right', category: 'pace',
    deliveries: {
      good_length: { lines: ['off', 'stumps', 'leg'], skill: 'accuracy', weight: 0.10 },
      yorker: { lines: ['stumps', 'off'], skill: 'yorker', weight: 0.035 },
      slower_ball: { lines: ['stumps', 'off'], skill: 'variation', weight: 0.05 },
      leg_cutter: { lines: ['leg', 'stumps'], skill: 'seam', weight: 0.03 },
      off_cutter: { lines: ['off', 'stumps'], skill: 'seam', weight: 0.03 },
      short: { lines: ['leg'], skill: 'bouncer', weight: 0.025 },
      full_tos: { lines: ['stumps'], skill: 'variation', weight: 0.02 },
    },
  },
  left_arm_medium: {
    id: 'left_arm_medium', name: 'Left-Arm Medium', arm: 'left', category: 'pace',
    deliveries: {
      good_length: { lines: ['off', 'stumps', 'leg'], skill: 'accuracy', weight: 0.10 },
      yorker: { lines: ['stumps', 'off'], skill: 'yorker', weight: 0.035 },
      slower_ball: { lines: ['stumps', 'off'], skill: 'variation', weight: 0.05 },
      leg_cutter: { lines: ['leg', 'stumps'], skill: 'seam', weight: 0.03 },
      off_cutter: { lines: ['off', 'stumps'], skill: 'seam', weight: 0.03 },
      short: { lines: ['leg'], skill: 'bouncer', weight: 0.025 },
      full_tos: { lines: ['stumps'], skill: 'variation', weight: 0.02 },
    },
  },
  // Off spin: turns INTO the right-hander (off→leg). Best aimed at off/stumps;
  // the leg line is the LBW bait.
  right_arm_off_spin: {
    id: 'right_arm_off_spin', name: 'Right-Arm Off-Spin', arm: 'right', category: 'spin', spinStyle: 'off',
    deliveries: {
      off_break: { lines: ['off', 'stumps', 'leg'], skill: 'spin', weight: 0.06 },
      carrom: { lines: ['off', 'stumps'], skill: 'variation', weight: 0.035 },
      doosra: { lines: ['off', 'stumps'], skill: 'variation', weight: 0.02 },
      teesra: { lines: ['stumps', 'off'], skill: 'variation', weight: 0.02 },
      topspin: { lines: ['stumps'], skill: 'spin', weight: 0.025 },
      arm_ball: { lines: ['stumps', 'off'], skill: 'variation', weight: 0.03 },
      good_length: { lines: ['off', 'stumps', 'leg'], skill: 'accuracy', weight: 0.05 },
      full_tos: { lines: ['stumps'], skill: 'variation', weight: 0.02 },
    },
  },
  // Leg spin: turns AWAY from the right-hander (leg→off). Best aimed at
  // leg/stumps; the off line beats the outside edge.
  right_arm_leg_spin: {
    id: 'right_arm_leg_spin', name: 'Right-Arm Leg-Spin', arm: 'right', category: 'spin', spinStyle: 'leg',
    deliveries: {
      leg_break: { lines: ['leg', 'stumps', 'off'], skill: 'spin', weight: 0.06 },
      googly: { lines: ['stumps', 'off'], skill: 'variation', weight: 0.025 },
      flipper: { lines: ['stumps', 'off'], skill: 'variation', weight: 0.02 },
      topspin: { lines: ['stumps'], skill: 'spin', weight: 0.03 },
      good_length: { lines: ['leg', 'stumps', 'off'], skill: 'accuracy', weight: 0.05 },
      full_tos: { lines: ['stumps'], skill: 'variation', weight: 0.02 },
    },
  },
  // Slow left-arm orthodox: turns AWAY from the right-hander (leg→off).
  // Best aimed at leg/stumps, beating the outside edge.
  slow_left_arm_orthodox: {
    id: 'slow_left_arm_orthodox', name: 'Slow Left-Arm Orthodox', arm: 'left', category: 'spin', spinStyle: 'off',
    deliveries: {
      off_break: { lines: ['leg', 'stumps', 'off'], skill: 'spin', weight: 0.06 },
      arm_ball: { lines: ['stumps', 'off'], skill: 'variation', weight: 0.03 },
      doosra: { lines: ['off', 'stumps'], skill: 'variation', weight: 0.018 },
      topspin: { lines: ['stumps'], skill: 'spin', weight: 0.025 },
      good_length: { lines: ['leg', 'stumps', 'off'], skill: 'accuracy', weight: 0.05 },
      full_tos: { lines: ['stumps'], skill: 'variation', weight: 0.02 },
    },
  },
  // Left-arm wrist spin (chinaman): turns INTO the right-hander (off→leg),
  // the mirror of leg spin. The googly turns the other way.
  left_arm_wrist_spin: {
    id: 'left_arm_wrist_spin', name: 'Left-Arm Wrist-Spin (Chinaman)', arm: 'left', category: 'spin', spinStyle: 'leg',
    deliveries: {
      leg_break: { lines: ['off', 'stumps', 'leg'], skill: 'spin', weight: 0.06 },
      googly: { lines: ['leg', 'stumps'], skill: 'variation', weight: 0.025 },
      flipper: { lines: ['stumps', 'off'], skill: 'variation', weight: 0.02 },
      topspin: { lines: ['stumps'], skill: 'spin', weight: 0.03 },
      good_length: { lines: ['off', 'stumps', 'leg'], skill: 'accuracy', weight: 0.05 },
      full_tos: { lines: ['stumps'], skill: 'variation', weight: 0.02 },
    },
  },
};

function getBowlerTypeName(typeId) {
  return BOWLER_TYPES[typeId]?.name || typeId || 'Bowler';
}

const LINES = {
  wide_off: { id: 'wide_off', name: 'Wide Outside Off', legal: true, zone: 'off' },
  off: { id: 'off', name: 'Outside Off', legal: true, zone: 'off' },
  stumps: { id: 'stumps', name: 'On Stumps', legal: true, zone: 'middle' },
  leg: { id: 'leg', name: 'On Leg', legal: true, zone: 'leg' },
  wide_leg: { id: 'wide_leg', name: 'Wide on Leg', legal: true, zone: 'leg' },
  behind: { id: 'behind', name: 'Down Leg', legal: true, zone: 'leg' },
  wide: { id: 'wide', name: 'Wide', legal: false, zone: 'wide' },
};

const SPEEDS = {
  control: { id: 'control', name: 'Control', kmh: 130 },
  fast: { id: 'fast', name: 'Fast', kmh: 142 },
  maximum: { id: 'maximum', name: 'Maximum', kmh: 150 },
  spin_slow: { id: 'spin_slow', name: 'Slow', kmh: 80 },
  spin_fast: { id: 'spin_fast', name: 'Quick Spin', kmh: 95 },
  spin_max: { id: 'spin_max', name: 'Maximum Spin', kmh: 105 },
};

// --- SHOT TYPES ---
const SHOT_TYPES = {
  // Defensive
  forward_defence: { id: 'forward_defence', name: 'Forward Defence', category: 'defensive', risk: 0.05, zones: ['off', 'middle', 'leg'] },
  back_foot_defence: { id: 'back_foot_defence', name: 'Back Foot Defence', category: 'defensive', risk: 0.05, zones: ['off', 'middle', 'leg'] },
  leave: { id: 'leave', name: 'Leave', category: 'defensive', risk: 0.02, zones: ['off'] },

  // Ground shots - Off side
  cover_drive: { id: 'cover_drive', name: 'Cover Drive', category: 'ground', risk: 0.20, zones: ['off'] },
  straight_drive: { id: 'straight_drive', name: 'Straight Drive', category: 'ground', risk: 0.15, zones: ['middle'] },
  on_drive: { id: 'on_drive', name: 'On Drive', category: 'ground', risk: 0.18, zones: ['middle', 'leg'] },
  square_cut: { id: 'square_cut', name: 'Square Cut', category: 'ground', risk: 0.22, zones: ['off'] },
  late_cut: { id: 'late_cut', name: 'Late Cut', category: 'ground', risk: 0.25, zones: ['off'] },
  flick: { id: 'flick', name: 'Flick', category: 'ground', risk: 0.18, zones: ['leg', 'middle'] },

  // Leg side
  pull: { id: 'pull', name: 'Pull Shot', category: 'leg_side', risk: 0.25, zones: ['leg', 'middle'] },
  hook: { id: 'hook', name: 'Hook Shot', category: 'leg_side', risk: 0.35, zones: ['leg'] },
  sweep: { id: 'sweep', name: 'Sweep', category: 'leg_side', risk: 0.28, zones: ['leg', 'off'] },
  paddle: { id: 'paddle', name: 'Paddle Sweep', category: 'leg_side', risk: 0.15, zones: ['leg'] },

  // Aggressive / Lofted
  lofted_drive: { id: 'lofted_drive', name: 'Lofted Drive', category: 'aggressive', risk: 0.35, zones: ['off', 'middle'] },
  lofted_straight: { id: 'lofted_straight', name: 'Lofted Straight', category: 'aggressive', risk: 0.30, zones: ['middle'] },
  lofted_leg: { id: 'lofted_leg', name: 'Lofted Leg Side', category: 'aggressive', risk: 0.32, zones: ['leg'] },
  reverse_sweep: { id: 'reverse_sweep', name: 'Reverse Sweep', category: 'aggressive', risk: 0.40, zones: ['off'] },

  // Innovation / high-risk shots — huge boundary upside, real wicket downside.
  // These are the "cricket IQ" shots: perfectly executed they beat the field,
  // mistimed or misread they get the batsman out.
  scoop: { id: 'scoop', name: 'Scoop (Lap)', category: 'aggressive', risk: 0.45, zones: ['leg', 'middle'] },
  reverse_lap: { id: 'reverse_lap', name: 'Reverse Lap', category: 'aggressive', risk: 0.50, zones: ['off', 'middle'] },
  ramp: { id: 'ramp', name: 'Ramp', category: 'aggressive', risk: 0.42, zones: ['off'] },
  switch_hit: { id: 'switch_hit', name: 'Switch Hit', category: 'aggressive', risk: 0.48, zones: ['off', 'leg'] },
  slog_sweep: { id: 'slog_sweep', name: 'Slog Sweep', category: 'aggressive', risk: 0.42, zones: ['leg'] },
  upper_cut: { id: 'upper_cut', name: 'Upper Cut', category: 'aggressive', risk: 0.40, zones: ['off'] },
};

// --- DELIVERY → SUITABLE SHOTS ---
// Which shots make cricketing sense against each delivery. Mirrors the
// getMatchupScore rules so the batsman is always offered logical counters:
//   e.g. yorker → forward defence is always on the menu, never a pull.
const DELIVERY_SHOT_FITS = {
  yorker: {
    defensive: ['forward_defence'],
    natural: ['straight_drive', 'flick', 'cover_drive', 'lofted_straight', 'scoop'],
  },
  wide_yorker: {
    defensive: ['forward_defence', 'leave'],
    natural: ['cover_drive', 'straight_drive', 'late_cut', 'ramp'],
  },
  full_tos: {
    defensive: ['forward_defence'],
    natural: ['cover_drive', 'straight_drive', 'on_drive', 'flick', 'lofted_drive', 'lofted_straight', 'scoop', 'ramp'],
  },
  good_length: {
    defensive: ['forward_defence', 'back_foot_defence'],
    natural: ['cover_drive', 'straight_drive', 'on_drive', 'flick', 'square_cut', 'late_cut', 'lofted_drive', 'ramp'],
  },
  short: {
    defensive: ['back_foot_defence'],
    natural: ['pull', 'hook', 'square_cut', 'late_cut', 'upper_cut'],
  },
  bouncer: {
    defensive: ['back_foot_defence', 'leave'],
    natural: ['hook', 'pull', 'upper_cut'],
  },
  slower_ball: {
    defensive: ['forward_defence', 'back_foot_defence'],
    natural: ['straight_drive', 'cover_drive', 'on_drive', 'flick', 'scoop'],
  },
  slower_yorker: {
    defensive: ['forward_defence'],
    natural: ['straight_drive', 'flick', 'cover_drive', 'scoop', 'ramp'],
  },
  knuckle_ball: {
    defensive: ['forward_defence'],
    natural: ['straight_drive', 'cover_drive', 'on_drive', 'flick', 'scoop'],
  },
  leg_cutter: {
    defensive: ['forward_defence', 'back_foot_defence'],
    natural: ['straight_drive', 'on_drive', 'flick', 'cover_drive'],
  },
  off_cutter: {
    defensive: ['forward_defence', 'back_foot_defence'],
    natural: ['straight_drive', 'cover_drive', 'on_drive', 'flick'],
  },
  reverse_swing: {
    defensive: ['forward_defence', 'back_foot_defence'],
    natural: ['straight_drive', 'cover_drive', 'on_drive', 'late_cut'],
  },
  off_break: {
    defensive: ['forward_defence'],
    natural: ['sweep', 'paddle', 'on_drive', 'cover_drive', 'late_cut', 'lofted_drive', 'slog_sweep', 'switch_hit'],
  },
  leg_break: {
    defensive: ['forward_defence'],
    natural: ['sweep', 'paddle', 'flick', 'on_drive', 'lofted_leg', 'slog_sweep', 'switch_hit'],
  },
  googly: {
    defensive: ['forward_defence'],
    natural: ['sweep', 'paddle', 'on_drive', 'flick', 'lofted_leg', 'slog_sweep'],
  },
  flipper: {
    defensive: ['forward_defence'],
    natural: ['on_drive', 'flick', 'straight_drive', 'sweep'],
  },
  topspin: {
    defensive: ['forward_defence'],
    natural: ['on_drive', 'flick', 'sweep', 'lofted_straight'],
  },
  carrom: {
    defensive: ['forward_defence'],
    natural: ['paddle', 'sweep', 'flick', 'on_drive'],
  },
  doosra: {
    defensive: ['forward_defence'],
    natural: ['sweep', 'paddle', 'cover_drive', 'on_drive'],
  },
  teesra: {
    defensive: ['back_foot_defence'],
    natural: ['pull', 'square_cut', 'late_cut', 'on_drive', 'slog_sweep'],
  },
};

// --- FIELD POSITIONS ---
// Batter-centred coordinate system: striker = origin (0,0).
//   0°  = straight toward bowler
//   +   = off side (right for a right-hander)
//   −   = leg side  (left  for a right-hander)
//   180°= behind the batter (wicketkeeper)
// distance: 0 = pitch centre, 1 = boundary edge
// Zone 2 (3–15 m): close catchers   → 0.15–0.30
// Zone 3 (15–27 m): inner ring       → 0.45–0.60
// Zone 5 (27 m → boundary): outfield → 0.85–0.95
// 30-yard circle radius in metres (ICC law)
const RESTRICTION_RADIUS = 27.43;

// --- FIELD POSITIONS ---
// Batter-centred: 0° = toward bowler, + = off side, − = leg side.
// Each position is a ZONE defined by angle range + distance range (metres).
// The engine picks an exact (r, θ) inside the zone; the renderer shows
// the zone as a shaded arc when the fielder is tapped.
//
// Fields:
//   angle     — centre angle (used for rendering the dot)
//   angleMin  — minimum angle of the zone
//   angleMax  — maximum angle of the zone
//   rMin      — minimum distance from batter (metres)
//   rMax      — maximum distance from batter (metres)
//   r         — centre distance = (rMin + rMax) / 2  (for rendering)
//   zone      — 'off' | 'leg'
//   infield   — true if the zone overlaps inside the 30-yard circle
const FIELD_POSITIONS = {
  // ──────── CLOSE CATCHERS (10–25 m) ────────
  slip:        { id: 'slip',        name: 'Slip',          angle: 157, angleMin: 150, angleMax: 165, rMin: 11, rMax: 18, r: 14.5, zone: 'off',  infield: true },
  slip_2:      { id: 'slip_2',      name: '2nd Slip',      angle: 147, angleMin: 140, angleMax: 155, rMin: 12, rMax: 20, r: 16,   zone: 'off',  infield: true },
  slip_3:      { id: 'slip_3',      name: '3rd Slip',      angle: 137, angleMin: 130, angleMax: 145, rMin: 13, rMax: 22, r: 17.5, zone: 'off',  infield: true },
  gully:       { id: 'gully',       name: 'Gully',         angle: 115, angleMin: 105, angleMax: 125, rMin: 15, rMax: 25, r: 20,   zone: 'off',  infield: true },
  silly_point: { id: 'silly_point', name: 'Silly Point',   angle:  95, angleMin:  85, angleMax: 105, rMin: 10, rMax: 15, r: 12.5, zone: 'off',  infield: true },
  short_leg:   { id: 'short_leg',   name: 'Short Leg',     angle: 252, angleMin: 235, angleMax: 270, rMin: 10, rMax: 15, r: 12.5, zone: 'leg',  infield: true },
  leg_gully:   { id: 'leg_gully',   name: 'Leg Gully',     angle: 225, angleMin: 210, angleMax: 240, rMin: 12, rMax: 20, r: 16,   zone: 'leg',  infield: true },
  leg_slip:    { id: 'leg_slip',    name: 'Leg Slip',      angle: 210, angleMin: 195, angleMax: 225, rMin: 11, rMax: 18, r: 14.5, zone: 'leg',  infield: true },

  // ──────── INNER RING (18–35 m) ────────
  point:                { id: 'point',                name: 'Point',                angle:  87, angleMin:  75, angleMax: 100, rMin: 18, rMax: 30, r: 24,   zone: 'off',  infield: true },
  backward_point:       { id: 'backward_point',       name: 'Backward Point',       angle: 102, angleMin:  90, angleMax: 115, rMin: 20, rMax: 32, r: 26,   zone: 'off',  infield: true },
  cover_point:          { id: 'cover_point',          name: 'Cover Point',          angle:  72, angleMin:  65, angleMax:  80, rMin: 20, rMax: 30, r: 25,   zone: 'off',  infield: true },
  cover:                { id: 'cover',                name: 'Cover',                angle:  57, angleMin:  45, angleMax:  70, rMin: 20, rMax: 35, r: 27.5, zone: 'off',  infield: true },
  extra_cover:          { id: 'extra_cover',          name: 'Extra Cover',          angle:  42, angleMin:  30, angleMax:  55, rMin: 20, rMax: 35, r: 27.5, zone: 'off',  infield: true },
  silly_mid_off:        { id: 'silly_mid_off',        name: 'Silly Mid-Off',        angle:  20, angleMin:  10, angleMax:  30, rMin: 10, rMax: 15, r: 12.5, zone: 'off',  infield: true },
  short_mid_off:        { id: 'short_mid_off',        name: 'Short Mid-Off',        angle:  17, angleMin:   5, angleMax:  30, rMin: 15, rMax: 22, r: 18.5, zone: 'off',  infield: true },
  mid_off:              { id: 'mid_off',              name: 'Mid Off',              angle:  17, angleMin:   5, angleMax:  30, rMin: 25, rMax: 35, r: 30,   zone: 'off',  infield: true },
  silly_mid_on:         { id: 'silly_mid_on',         name: 'Silly Mid-On',         angle: 340, angleMin: 330, angleMax: 350, rMin: 10, rMax: 15, r: 12.5, zone: 'leg',  infield: true },
  short_mid_on:         { id: 'short_mid_on',         name: 'Short Mid-On',         angle: 342, angleMin: 330, angleMax: 355, rMin: 15, rMax: 22, r: 18.5, zone: 'leg',  infield: true },
  mid_on:               { id: 'mid_on',               name: 'Mid On',               angle: 342, angleMin: 330, angleMax: 355, rMin: 25, rMax: 35, r: 30,   zone: 'leg',  infield: true },
  short_midwicket:      { id: 'short_midwicket',      name: 'Short Mid-Wicket',     angle: 315, angleMin: 300, angleMax: 330, rMin: 15, rMax: 22, r: 18.5, zone: 'leg',  infield: true },
  midwicket:            { id: 'midwicket',            name: 'Midwicket',            angle: 307, angleMin: 285, angleMax: 330, rMin: 22, rMax: 35, r: 28.5, zone: 'leg',  infield: true },
  short_square_leg:     { id: 'short_square_leg',     name: 'Short Square Leg',     angle: 267, angleMin: 250, angleMax: 285, rMin: 15, rMax: 22, r: 18.5, zone: 'leg',  infield: true },
  square_leg:           { id: 'square_leg',           name: 'Square Leg',           angle: 265, angleMin: 250, angleMax: 280, rMin: 22, rMax: 32, r: 27,   zone: 'leg',  infield: true },
  forward_square_leg:   { id: 'forward_square_leg',   name: 'Forward Square Leg',   angle: 247, angleMin: 235, angleMax: 260, rMin: 20, rMax: 30, r: 25,   zone: 'leg',  infield: true },
  backward_square_leg:  { id: 'backward_square_leg',  name: 'Backward Square Leg',  angle: 287, angleMin: 275, angleMax: 300, rMin: 25, rMax: 35, r: 30,   zone: 'leg',  infield: true },
  short_fine_leg:       { id: 'short_fine_leg',       name: 'Short Fine Leg',       angle: 212, angleMin: 200, angleMax: 225, rMin: 15, rMax: 25, r: 20,   zone: 'leg',  infield: true },
  fine_leg:             { id: 'fine_leg',             name: 'Fine Leg',             angle: 207, angleMin: 195, angleMax: 220, rMin: 30, rMax: 50, r: 40,   zone: 'leg',  infield: true },
  short_third_man:      { id: 'short_third_man',      name: 'Short Third Man',      angle: 125, angleMin: 110, angleMax: 140, rMin: 20, rMax: 30, r: 25,   zone: 'off',  infield: true },
  third_man:            { id: 'third_man',            name: 'Third Man',            angle: 140, angleMin: 120, angleMax: 160, rMin: 45, rMax: 70, r: 57.5, zone: 'off',  infield: false },

  // ──────── BOUNDARY / OUTFIELD (40–75 m) ────────
  deep_gully:            { id: 'deep_gully',            name: 'Deep Gully',            angle: 112, angleMin: 100, angleMax: 125, rMin: 35, rMax: 60, r: 47.5, zone: 'off',  infield: false },
  deep_point:            { id: 'deep_point',            name: 'Deep Point',            angle:  92, angleMin:  75, angleMax: 110, rMin: 40, rMax: 70, r: 55,   zone: 'off',  infield: false },
  deep_backward_point:   { id: 'deep_backward_point',   name: 'Deep Backward Point',   angle: 107, angleMin:  95, angleMax: 120, rMin: 45, rMax: 70, r: 57.5, zone: 'off',  infield: false },
  deep_cover:            { id: 'deep_cover',            name: 'Deep Cover',            angle:  60, angleMin:  45, angleMax:  75, rMin: 45, rMax: 70, r: 57.5, zone: 'off',  infield: false },
  deep_extra_cover:      { id: 'deep_extra_cover',      name: 'Deep Extra Cover',      angle:  42, angleMin:  30, angleMax:  55, rMin: 45, rMax: 70, r: 57.5, zone: 'off',  infield: false },
  cover_sweeper:         { id: 'cover_sweeper',         name: 'Cover Sweeper',         angle:  60, angleMin:  40, angleMax:  80, rMin: 45, rMax: 70, r: 57.5, zone: 'off',  infield: false },
  deep_mid_off:          { id: 'deep_mid_off',          name: 'Deep Mid-Off',          angle:  17, angleMin:   5, angleMax:  30, rMin: 40, rMax: 60, r: 50,   zone: 'off',  infield: false },
  long_off:              { id: 'long_off',              name: 'Long Off',              angle:  12, angleMin:   0, angleMax:  25, rMin: 50, rMax: 75, r: 62.5, zone: 'off',  infield: false },
  deep_mid_on:           { id: 'deep_mid_on',           name: 'Deep Mid-On',           angle: 342, angleMin: 330, angleMax: 355, rMin: 40, rMax: 60, r: 50,   zone: 'leg',  infield: false },
  long_on:               { id: 'long_on',               name: 'Long On',               angle: 347, angleMin: 335, angleMax: 360, rMin: 50, rMax: 75, r: 62.5, zone: 'leg',  infield: false },
  deep_midwicket:        { id: 'deep_midwicket',        name: 'Deep Midwicket',        angle: 307, angleMin: 285, angleMax: 330, rMin: 45, rMax: 70, r: 57.5, zone: 'leg',  infield: false },
  cow_corner:            { id: 'cow_corner',            name: 'Cow Corner',            angle: 317, angleMin: 300, angleMax: 335, rMin: 50, rMax: 75, r: 62.5, zone: 'leg',  infield: false },
  deep_square:           { id: 'deep_square',           name: 'Deep Square Leg',       angle: 275, angleMin: 250, angleMax: 300, rMin: 45, rMax: 70, r: 57.5, zone: 'leg',  infield: false },
  deep_backward_square:  { id: 'deep_backward_square',  name: 'Deep Backward Square',  angle: 292, angleMin: 275, angleMax: 310, rMin: 45, rMax: 70, r: 57.5, zone: 'leg',  infield: false },
  deep_fine_leg:         { id: 'deep_fine_leg',         name: 'Deep Fine Leg',         angle: 205, angleMin: 190, angleMax: 220, rMin: 50, rMax: 75, r: 62.5, zone: 'leg',  infield: false },
  long_leg:              { id: 'long_leg',              name: 'Long Leg',              angle: 225, angleMin: 210, angleMax: 240, rMin: 45, rMax: 70, r: 57.5, zone: 'leg',  infield: false },
  deep_third_man:        { id: 'deep_third_man',        name: 'Deep Third Man',        angle: 142, angleMin: 120, angleMax: 165, rMin: 50, rMax: 75, r: 62.5, zone: 'off',  infield: false },
};

// --- FIELD PRESETS ---
// 5 tactical modes × directional bias = 15 possible combinations.
// Each preset satisfies cricket's fielding laws (see validateField).
// Positions use the new real-metre IDs from FIELD_POSITIONS.
const FIELD_PRESETS = {
  // ──────────── BALANCED ────────────
  // Objective: min Var(coverage) — even angular spread.
  // Best: unknown batter intent, new batter, no extreme matchup.
  balanced: {
    name: 'Balanced',
    positions: [
      'slip', 'gully', 'point', 'cover', 'mid_off',
      'mid_on', 'midwicket', 'square_leg', 'fine_leg',
      'third_man', 'long_on',
    ],
  },

  // ──────────── ATTACKING ────────────
  // Objective: max P(wicket) — close catchers, pressure.
  // Best: new/uncertain batter, seaming conditions, spin with rough.
  attacking: {
    name: 'Attacking',
    positions: [
      'slip', 'slip_2', 'gully', 'silly_point', 'short_leg',
      'point', 'cover', 'mid_off', 'mid_on', 'midwicket', 'third_man',
    ],
  },

  // ──────────── DEFENSIVE ────────────
  // Objective: min E(runs) — boundary protection, no close catchers.
  // Best: protecting a total, set batter dominating.
  defensive: {
    name: 'Defensive',
    positions: [
      'point', 'cover', 'extra_cover', 'mid_off',
      'mid_on', 'midwicket', 'square_leg', 'fine_leg',
      'third_man', 'long_off', 'long_on',
    ],
  },

  // ──────────── DEATH ────────────
  // Objective: min [4·P(4) + 6·P(6)] — boundary prevention.
  // 5 boundary riders + 6 ring. Best: overs 16–20.
  death: {
    name: 'Death',
    positions: [
      'third_man', 'long_off', 'long_on', 'deep_midwicket', 'deep_square',
      'mid_off', 'mid_on', 'cover', 'point', 'extra_cover', 'fine_leg',
    ],
  },

  // ──────────── POWERPLAY ────────────
  // Objective: wicket pressure + restriction-aware coverage.
  // Best: overs 1–6, new ball, swing/seam.
  powerplay: {
    name: 'Powerplay',
    positions: [
      'slip', 'gully', 'point', 'cover', 'extra_cover',
      'mid_off', 'mid_on', 'midwicket', 'fine_leg',
      'third_man', 'long_on',
    ],
  },
};

// ============================================================
// FIELD LEGALITY — cricket's fielding laws, simplified
// ============================================================
function validateField(fielderIds) {
  const issues = [];
  const positions = (fielderIds || []).map(id => FIELD_POSITIONS[id]).filter(Boolean);

  if (positions.length !== 11) {
    issues.push(`A fielding side has 11 players (currently ${positions.length})`);
  }

  // At the instant of delivery, no more than 5 fielders may be on the leg side
  const legSide = positions.filter(p => p.zone === 'leg').length;
  if (legSide > 5) {
    issues.push(`Maximum 5 fielders allowed on the leg side (currently ${legSide})`);
  }

  // No more than 5 fielders outside the 30-yard circle
  const outsideCircle = positions.filter(p => !p.infield).length;
  if (outsideCircle > 5) {
    issues.push(`Maximum 5 fielders allowed outside the 30-yard circle (currently ${outsideCircle})`);
  }

  // No more than 2 fielders behind square on the leg side
  const behindSquareLeg = positions.filter(p => p.angle >= 180 && p.angle <= 270).length;
  if (behindSquareLeg > 2) {
    issues.push(`Maximum 2 fielders allowed behind square on the leg side (currently ${behindSquareLeg})`);
  }

  return issues;
}

// ============================================================
// OUTCOME CALCULATION
// ============================================================

/**
 * Calculate the outcome of a ball.
 * @param {Object} delivery - { type, line, speed }
 * @param {Object} shot - { type, power }
 * @param {Object} bowler - bowler attributes
 * @param {Object} batsman - batsman attributes
 * @param {Array} fielders - array of fielder position ids
 * @param {Object} context - { confidence, pressure, matchState }
 * @returns {Object} outcome
 */
function calculateOutcome(delivery, shot, bowler, batsman, fielders, context = {}) {
  const result = {
    runs: 0,          // runs off the bat (0 for a wide)
    extraRuns: 0,     // 1 for a wide or no-ball
    wicket: false,
    wicketType: null,
    description: '',
    explanation: [],
    isWide: false,
    isNoBall: false,
    isEdge: false,
    isCatch: false,
    fielderInvolved: null,
  };

  const delType = DELIVERY_TYPES[delivery.type];
  const shotType = SHOT_TYPES[shot.type];
  const line = LINES[delivery.line];

  if (!delType || !shotType || !line) {
    result.description = 'Invalid delivery or shot';
    return result;
  }

  // Check for wide
  if (line.id === 'wide') {
    result.isWide = true;
    result.runs = 0;
    result.extraRuns = 1;
    result.description = 'WIDE BALL';
    result.explanation.push('Delivery strayed too wide to be a legal ball');
    return result;
  }

  // --- MARGINAL LINES (design doc: "wide depends on the shot") ---
  // A delivery on the wide-off corridor (wide_off) or down the leg side
  // (wide_leg / behind) is only LEGAL if the batsman plays a shot that can
  // reach it. Wrong-side shot or leave → WIDE.
  //   · wide_off:  reachable by off-side shots (drive/cut/ramp) — a leave or
  //                a leg-side shot concedes a wide.
  //   · down leg:  reachable ONLY by the fine-leg innovation shots (scoop /
  //                reverse lap / paddle). And even the lap needs confidence:
  //                bat confidence > bowler confidence → four/six; otherwise
  //                the mistimed lap sails past and it is a WIDE.
  const offReach = shotType.zones.includes('off');
  const lapFamily = ['scoop', 'reverse_lap', 'paddle'];
  let wideByReach = false;
  let lapConversion = false;

  if (line.id === 'wide_off') {
    if (shotType.id === 'leave' || !offReach) wideByReach = true;
  } else if (line.id === 'wide_leg' || line.id === 'behind') {
    if (lapFamily.includes(shotType.id)) {
      const batConf = context.batsmanConfidence ?? context.confidence ?? 70;
      const bowlConf = context.bowlerConfidence ?? 70;
      lapConversion = batConf > bowlConf;
      if (!lapConversion) wideByReach = true;
    } else {
      wideByReach = true;
    }
  }

  if (wideByReach) {
    result.isWide = true;
    result.runs = 0;
    result.extraRuns = 1;
    result.description = 'WIDE BALL';
    result.explanation.push(
      `Delivery: ${delType.name} on ${line.name}`,
      `Shot: ${shotType.name} — could not reach the ball`,
      line.id === 'wide_off'
        ? 'Ball passed beyond reach on the off side — an off-side shot was needed to keep it legal'
        : 'Only a lap / scoop / paddle can convert a ball down the leg side'
    );
    return result;
  }

  // Check for no ball (simplified: high speed + poor accuracy = occasional no ball)
  const noBallChance = calculateNoBallChance(bowler, context);
  if (Math.random() < noBallChance) {
    result.isNoBall = true;
    result.explanation.push('Bowler overstepped');
    // The batsman still plays the shot; a wicket is NOT possible off a no-ball
  }

  // Calculate base success rate from shot-delivery matchup
  const matchupScore = getMatchupScore(delivery, shot);

  // Adjust for player attributes
  const bowlerSkill = getBowlerSkillForDelivery(bowler, delivery);
  const batsmanSkill = getBatsmanSkillForShot(batsman, shot);

  // Calculate execution quality
  const bowlerExecution = calculateExecution(bowlerSkill, bowler, context, 'bowler');
  const batsmanExecution = calculateExecution(batsmanSkill, batsman, context, 'batsman');

  // Field influence — geometry + the actual fielder's skill at that position.
  // Pass the batsman's handedness so left-hander shot angles are mirrored.
  const fieldInfluence = calculateFieldInfluence(shot, fielders, delivery, context.fieldersRoster || {}, batsman?.handed);

  // Power affects risk and reward
  const power = shot.power || 50;
  const riskMultiplier = 1 + (power - 50) / 100; // 0.5 to 1.5
  const rewardMultiplier = power / 50; // 0 to 2

  // Calculate outcome probabilities
  const outcomeProbs = calculateOutcomeProbabilities(
    matchupScore,
    bowlerExecution,
    batsmanExecution,
    fieldInfluence,
    riskMultiplier,
    shotType,
    delivery,
    context
  );

  // Lap conversion on a down-leg delivery: the confident lap reads the wide
  // and flicks it fine for four or six (design doc point: lap shot rule).
  if (lapConversion) {
    outcomeProbs.four += 0.18;
    outcomeProbs.six += 0.12;
    outcomeProbs.dot -= 0.12;
    outcomeProbs.single -= 0.10;
    outcomeProbs.double -= 0.05;
    outcomeProbs.wicket -= 0.03;
    normalizeProbs(outcomeProbs);
    result.explanation.push('Lap shot converts a down-leg delivery — confident read');
  }

  // Catches: aerial shots (lofted/leg-side) hit near a fielder with good
  // hands become wickets; a fielder right there also cuts off boundaries.
  const aerial = shotType.category === 'aggressive' || shotType.category === 'leg_side';
  const catchFielder = fieldInfluence.catchPlayer;
  if (aerial && catchFielder && fieldInfluence.catchPosition) {
    const catching = catchFielder.fielding?.catching ?? 70;
    const reflex = catchFielder.fielding?.reflex ?? 70;
    const skill = (catching + reflex) / 2;
    const angleBonus = fieldInfluence.angleMatch === 'close' ? 1 : fieldInfluence.angleMatch === 'moderate' ? 0.55 : 0.15;
    const catchChance = (skill / 100) * 0.14 * angleBonus;
    outcomeProbs.wicket += catchChance;
    outcomeProbs.four -= catchChance * 0.6;
    outcomeProbs.six -= catchChance * 0.6;
    normalizeProbs(outcomeProbs);
  }

  // Pick outcome based on probabilities
  const outcome = pickOutcome(outcomeProbs, fieldInfluence);

  result.runs = outcome.runs;
  result.wicket = outcome.wicket;
  result.wicketType = outcome.wicketType;
  result.description = outcome.description;
  result.isEdge = outcome.isEdge || false;
  result.isCatch = outcome.isCatch || false;
  result.fielderInvolved = outcome.fielderInvolved || null;
  result.catchFielderName = outcome.catchFielderName || null;

  // Build explanation
  result.explanation = buildExplanation(delivery, shot, bowler, batsman, outcome, matchupScore, bowlerExecution, batsmanExecution, fieldInfluence);

  // No-ball: batsman cannot be dismissed (run out not modelled), +1 extra run
  if (result.isNoBall) {
    result.wicket = false;
    result.wicketType = null;
    result.isCatch = false;
    result.extraRuns = 1;
    result.description = `NO BALL — ${result.description}`;
    result.explanation.push('+ 1 run for no ball');
  }

  return result;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function calculateNoBallChance(bowler, context) {
  // Base no ball chance ~3%, reduced by accuracy skill
  const accuracy = bowler.accuracy || 70;
  const base = 0.03;
  const reduction = (accuracy - 50) / 500; // -0.02 to +0.02
  const pressureEffect = (context.pressure || 0) / 2000;
  return Math.max(0.01, Math.min(0.06, base - reduction + pressureEffect));
}

function getMatchupScore(delivery, shot) {
  // Returns 0-100: how well the shot matches the delivery
  const delType = DELIVERY_TYPES[delivery.type];
  const shotType = SHOT_TYPES[shot.type];
  const line = LINES[delivery.line];

  let score = 50; // Base

  // YORKER matchups
  if (delType.id === 'yorker' || delType.id === 'wide_yorker') {
    if (['straight_drive', 'flick', 'forward_defence'].includes(shotType.id)) score += 15;
    else if (['pull', 'hook', 'sweep'].includes(shotType.id)) score -= 25;
    else if (['lofted_drive', 'lofted_straight'].includes(shotType.id)) score -= 10;
    else if (['cover_drive'].includes(shotType.id) && line.zone === 'off') score += 10;
  }

  // GOOD LENGTH matchups
  if (delType.id === 'good_length') {
    if (['forward_defence', 'back_foot_defence'].includes(shotType.id)) score += 10;
    else if (['cover_drive', 'straight_drive', 'on_drive'].includes(shotType.id)) score += 5;
    else if (['pull', 'hook'].includes(shotType.id)) score -= 5;
    else if (['lofted_drive', 'lofted_straight'].includes(shotType.id)) score -= 15;
  }

  // SHORT BALL matchups
  if (delType.id === 'short' || delType.id === 'bouncer') {
    if (['pull', 'hook'].includes(shotType.id)) score += 20;
    else if (['back_foot_defence'].includes(shotType.id)) score += 10;
    else if (['cover_drive', 'straight_drive', 'on_drive'].includes(shotType.id)) score -= 20;
    else if (['sweep'].includes(shotType.id)) score -= 10;
  }

  // FULL TOSS matchups
  if (delType.id === 'full_tos') {
    if (['pull', 'hook', 'sweep'].includes(shotType.id)) score -= 15;
    else if (['cover_drive', 'straight_drive', 'lofted_drive'].includes(shotType.id)) score += 10;
    else score += 5; // Generally easier to hit
  }

  // SLOWER BALL matchups
  if (delType.id === 'slower_ball') {
    if (['pull', 'hook'].includes(shotType.id)) score -= 10;
    if (shot.power > 70) score -= 15; // Early swing into slow ball is bad
    if (['forward_defence', 'back_foot_defence'].includes(shotType.id)) score += 10;
  }

  // SPIN matchups
  if (delType.category === 'spin') {
    if (['sweep', 'paddle', 'reverse_sweep'].includes(shotType.id)) score += 10;
    else if (['pull', 'hook'].includes(shotType.id)) score -= 5;
    if (delType.id === 'googly' && shotType.category === 'aggressive') score -= 10;
    // NOTE: slog sweep / switch hit get their spin bonus in the INNOVATION
    // block below — never double-count them here or they beat the sweep.
    // The wrong variations beat even a good shot
    if (delType.id === 'flipper' && ['sweep', 'reverse_sweep'].includes(shotType.id)) score -= 15;
    if (delType.id === 'teesra' && ['forward_defence'].includes(shotType.id)) score -= 10;
  }

  // INNOVATION SHOTS vs specific deliveries
  // Scoop / ramp — playable against yorkers and full tosses (helps to have
  // pace to work with), suicidal against short balls.
  if (['scoop', 'ramp'].includes(shotType.id)) {
    if (['yorker', 'full_tos', 'slower_yorker', 'knuckle_ball'].includes(delType.id)) score += 12;
    else if (['short', 'bouncer'].includes(delType.id)) score -= 30;
    else if (delType.category === 'spin') score -= 10;
  }
  // Reverse lap — extreme version of the scoop, off-side fine
  if (shotType.id === 'reverse_lap') {
    if (['yorker', 'slower_yorker'].includes(delType.id)) score += 10;
    else if (['short', 'bouncer'].includes(delType.id)) score -= 35;
    else if (delType.category === 'spin') score -= 8;
  }
  // Upper cut — only against short balls (its whole purpose)
  if (shotType.id === 'upper_cut') {
    if (['short', 'bouncer'].includes(delType.id)) score += 18;
    else if (['yorker', 'full_tos', 'slower_yorker'].includes(delType.id)) score -= 25;
  }
  // Switch hit — can be played to spin, but a yorker/short ball finds it out
  if (shotType.id === 'switch_hit') {
    if (delType.category === 'spin') score += 10;
    else if (['yorker', 'slower_yorker'].includes(delType.id)) score -= 20;
    else if (['short', 'bouncer'].includes(delType.id)) score -= 15;
  }
  // Slog sweep — the big leg-side heave; good against spin, poor vs pace
  if (shotType.id === 'slog_sweep') {
    if (delType.category === 'spin') score += 10;
    else if (['yorker', 'slower_yorker'].includes(delType.id)) score -= 20;
    else if (['bouncer'].includes(delType.id)) score -= 10;
  }

  // NEW VARIATIONS — deceptive deliveries punish wrong reads and reward
  // the textbook counter (defence / straight drive).
  if (delType.id === 'slower_yorker' || delType.id === 'knuckle_ball') {
    if (['forward_defence', 'straight_drive'].includes(shotType.id)) score += 8;
    else if (shot.power > 70) score -= 18; // early swing into a change of pace
  }
  if (delType.id === 'leg_cutter' || delType.id === 'off_cutter') {
    if (['forward_defence', 'back_foot_defence'].includes(shotType.id)) score += 8;
    else if (shot.power > 70) score -= 8; // nips off the seam, hard to slog
  }
  if (delType.id === 'reverse_swing') {
    if (['forward_defence', 'back_foot_defence', 'straight_drive'].includes(shotType.id)) score += 8;
    else if (shotType.category === 'aggressive') score -= 12; // late swing beats the loft
  }

  // Line-zone alignment
  if (line.zone === shotType.zones[0] || shotType.zones.includes(line.zone)) {
    score += 5;
  } else {
    score -= 5;
  }

  // Leave should only work for off-side deliveries
  if (shotType.id === 'leave') {
    if (line.zone === 'off') score += 20;
    else score -= 30; // Can't leave a ball on the stumps
  }

  return Math.max(0, Math.min(100, score));
}

function getBowlerSkillForDelivery(bowler, delivery) {
  const delType = DELIVERY_TYPES[delivery.type];
  const skillMap = {
    yorker: bowler.yorker || 70,
    good_length: bowler.accuracy || 70,
    short: bowler.bouncer || 65,
    bouncer: bowler.bouncer || 65,
    full_tos: bowler.control || 60,
    slower_ball: bowler.variation || 65,
    slower_yorker: ((bowler.yorker || 60) + (bowler.variation || 60)) / 2,
    knuckle_ball: bowler.variation || 60,
    leg_cutter: bowler.seam || 60,
    off_cutter: bowler.seam || 60,
    reverse_swing: bowler.swing || 55,
    wide_yorker: bowler.yorker || 70,
    off_break: bowler.spin || 70,
    leg_break: bowler.spin || 70,
    googly: bowler.variation || 60,
    flipper: bowler.variation || 55,
    topspin: bowler.spin || 65,
    carrom: bowler.variation || 55,
    doosra: bowler.variation || 50,
    teesra: bowler.variation || 50,
  };
  return skillMap[delType.id] || 65;
}

function getBatsmanSkillForShot(batsman, shot) {
  const shotType = SHOT_TYPES[shot.type];
  const skillMap = {
    defensive: batsman.technique || 70,
    ground: batsman.timing || 70,
    leg_side: ((batsman.pull || 65) + (batsman.timing || 70)) / 2,
    aggressive: ((batsman.power || 70) + (batsman.timing || 70)) / 2,
  };
  return skillMap[shotType.category] || 65;
}

function calculateExecution(skill, player, context, role) {
  // Execution quality based on skill, confidence, pressure.
  // Each role uses ITS OWN confidence — the bowler must never inherit the
  // batsman's confidence (was a real bug: bowler execution used batsman conf).
  const confidence = (role === 'bowler'
    ? (context.bowlerConfidence ?? context.confidence ?? 70)
    : (context.batsmanConfidence ?? context.confidence ?? 70)) / 100;
  const pressure = (context.pressure || 0) / 100;
  const mentalStrength = (player.mentalStrength || 70) / 100;

  let execution = skill;

  // Confidence boost/penalty
  execution += (confidence - 0.6) * 20;

  // Pressure penalty (reduced by mental strength)
  execution -= pressure * 10 * (1 - mentalStrength * 0.5);

  // Random variance
  execution += (Math.random() - 0.5) * 12;

  return Math.max(20, Math.min(98, execution));
}

function calculateFieldInfluence(shot, fielderIds, delivery, roster = {}, handedness) {
  // How well does the field match the shot direction
  const shotType = SHOT_TYPES[shot.type];
  const fieldPositions = fielderIds.map(id => FIELD_POSITIONS[id]).filter(Boolean);

  if (fieldPositions.length === 0) return { score: 50, catchPosition: null, catchPlayer: null, angleMatch: 'wide' };

  // Determine likely ball direction based on shot — mirrored for left-handers
  const ballAngle = getShotAngle(shotType.id, handedness);

  // A lofted shot flies OVER the ring — only boundary fielders can catch it.
  // Ground shots can be caught by whoever is closest (ring or deep).
  const aerial = shotType.category === 'aggressive';

  // Field score: closest fielder overall (a ring fielder in the right spot
  // still cuts off runs even if they can't catch the lofted ball).
  // f.r = centre distance in metres; normalise to 0–1 (max ~75 m).
  let closestDist = Infinity;
  let closestFielder = null;
  for (const f of fieldPositions) {
    const angleDiff = Math.abs(f.angle - ballAngle);
    const normalizedDiff = angleDiff > 180 ? 360 - angleDiff : angleDiff;
    const dist = normalizedDiff / 180 + (1 - (f.r || 30) / 75) * 0.5;
    if (dist < closestDist) {
      closestDist = dist;
      closestFielder = f;
    }
  }

  // Catch fielder: for aerial shots, only outfielders; otherwise the closest.
  const catchCandidates = aerial ? fieldPositions.filter(f => !f.infield) : fieldPositions;
  let catchDist = Infinity;
  let catchFielder = null;
  for (const f of catchCandidates) {
    const angleDiff = Math.abs(f.angle - ballAngle);
    const normalizedDiff = angleDiff > 180 ? 360 - angleDiff : angleDiff;
    const dist = normalizedDiff / 180 + (1 - (f.r || 30) / 75) * 0.5;
    if (dist < catchDist) {
      catchDist = dist;
      catchFielder = f;
    }
  }

  const catchPlayer = (catchFielder && roster[catchFielder.id]) || null;

  return {
    score: closestDist * 100, // LOWER = better-set field
    catchPosition: catchFielder,
    catchPlayer,
    angleMatch: catchDist < 0.3 ? 'close' : catchDist < 0.6 ? 'moderate' : 'wide',
  };
}

// Mirror an angle around the vertical axis (0°/180°).
// Used to convert right-handed shot angles to left-handed equivalents:
// a right-hander's cover drive (45° off-side) becomes 315° (left-hander's off-side).
function mirrorAngle(angle) {
  return (360 - angle) % 360;
}

function getShotAngle(shotId, handedness) {
  // Batter-centred angles: 0° = toward bowler, + = off side, − = leg side.
  const angles = {
    cover_drive:     45,   // off side, in front of square
    straight_drive:   0,   // straight back past the bowler
    on_drive:       345,   // leg side, close to straight  (−15°)
    square_cut:      70,   // off side, square
    late_cut:       150,   // behind, off side (third man)
    flick:          300,   // leg side, in front of square (−60°)
    pull:           300,   // leg side, in front of square
    hook:           240,   // behind square, leg side (−120°)
    sweep:          270,   // leg side, square (−90°)
    paddle:         210,   // behind square, leg side (−150°)
    lofted_drive:    45,   // aerial cover drive
    lofted_straight:  0,   // straight six
    lofted_leg:     300,   // aerial leg side
    reverse_sweep:   45,   // reversed stance → off side
    scoop:          180,   // over the keeper
    reverse_lap:    150,   // over slips to third man
    ramp:           150,   // over keeper to third man
    switch_hit:      45,   // reversed stance → off side
    slog_sweep:     300,   // big leg-side heave
    upper_cut:      150,   // over slips to third man
    forward_defence:  0,   // straight
    back_foot_defence: 0,  // straight
    leave:           0,   // straight
  };
  const base = angles[shotId] || 0;
  // Left-handers: mirror every angle around the vertical axis (0°/180°).
  // This swaps off-side ↔ leg-side, so the field influence correctly
  // measures coverage against where the ball ACTUALLY goes.
  return handedness === 'left' ? mirrorAngle(base) : base;
}

function calculateOutcomeProbabilities(matchup, bowlerExec, batsmanExec, field, riskMult, shotType, delivery, context) {
  // Base probabilities for different shot categories
  let probs = { dot: 0.30, single: 0.25, double: 0.10, triple: 0.02, four: 0.15, six: 0.08, wicket: 0.10 };

  // Adjust based on shot category
  if (shotType.category === 'defensive') {
    probs.dot = 0.55;
    probs.single = 0.25;
    probs.double = 0.03;
    probs.triple = 0;
    probs.four = 0.05;
    probs.six = 0;
    probs.wicket = 0.02;
  } else if (shotType.category === 'ground') {
    probs.dot = 0.25;
    probs.single = 0.30;
    probs.double = 0.12;
    probs.triple = 0.03;
    probs.four = 0.20;
    probs.six = 0.02;
    probs.wicket = 0.08;
  } else if (shotType.category === 'leg_side') {
    probs.dot = 0.20;
    probs.single = 0.25;
    probs.double = 0.10;
    probs.triple = 0.03;
    probs.four = 0.22;
    probs.six = 0.08;
    probs.wicket = 0.12;
  } else if (shotType.category === 'aggressive') {
    probs.dot = 0.15;
    probs.single = 0.15;
    probs.double = 0.08;
    probs.triple = 0.02;
    probs.four = 0.25;
    probs.six = 0.15;
    probs.wicket = 0.20;
  }

  // --- SHOT-ROLE BANDS (design doc: the 3 offered shots are a perfect read,
  // a decent option, and a trap — and confidence decides how each plays out)
  //   matchup < 35   MISTAKE shot: a wicket unless the batsman is very
  //                  confident; then it becomes mostly dot / single (0 or 1).
  //   matchup 35-58  DECENT shot: 1/2/3 runs; boundaries only unlocked by
  //                  high batting confidence (and rarely).
  //   matchup > 58   PERFECT shot: scoring scales with batting confidence.
  const batConf = (context.batsmanConfidence ?? context.confidence ?? 70) / 100;
  if (matchup < 35) {
    probs.wicket += 0.30 - batConf * 0.28; // 0.30 → 0.04 as confidence rises
    probs.dot += 0.12 + batConf * 0.12;
    probs.single += 0.08 + (1 - batConf) * 0.06;
    probs.four -= 0.12;
    probs.six -= 0.10;
    probs.double -= 0.04;
  } else if (matchup < 58) {
    probs.single += 0.10;
    probs.double += 0.06;
    probs.triple += 0.03;
    probs.four -= 0.05 + (1 - batConf) * 0.10;
    probs.six -= 0.04 + (1 - batConf) * 0.05;
    probs.wicket -= 0.03;
  } else {
    probs.four += 0.06 * batConf;
    probs.six += 0.04 * batConf;
    probs.dot -= 0.07 * batConf;
    probs.single += 0.02;
  }

  // Bowler execution: better bowling = more dots/wickets
  const bowlerBonus = (bowlerExec - 65) / 200;
  probs.dot += bowlerBonus * 0.1;
  probs.wicket += bowlerBonus * 0.05;
  probs.four -= bowlerBonus * 0.08;
  probs.six -= bowlerBonus * 0.03;

  // Batsman execution: better batting = more scoring
  const batsmanBonus = (batsmanExec - 65) / 200;
  probs.four += batsmanBonus * 0.08;
  probs.six += batsmanBonus * 0.05;
  probs.dot -= batsmanBonus * 0.08;
  probs.wicket -= batsmanBonus * 0.04;

  // SHOT RISK — the shot's intrinsic riskiness (design doc point 30).
  // A high-risk shot (scoop, switch hit, upper cut) trades safe runs for a
  // boundary OR a wicket: it can't just be a boring single. Baseline ~0.2
  // for a standard aggressive shot; innovation shots go higher. The mass is
  // MOVED (subtracted from dot/single) so normalizeProbs doesn't dilute it.
  const shotRisk = shotType.risk || 0.2;
  const riskVariance = shotRisk - 0.2; // 0 for baseline, +0.3 for switch hit
  probs.six += riskVariance * 0.55;
  probs.four += riskVariance * 0.20;
  probs.wicket += riskVariance * 0.65;
  probs.dot -= riskVariance * 0.35;
  probs.single -= riskVariance * 0.35;
  probs.double -= riskVariance * 0.25;
  probs.triple -= riskVariance * 0.05;

  // DELIVERY RISK — a risky variation that comes off beats the bat (wicket,
  // dot); one that's read gets dispatched (four, six). High variance.
  const deliveryRisk = DELIVERY_TYPES[delivery.type]?.risk || 0.1;
  const delVariance = deliveryRisk - 0.1; // 0 for a stock ball, +0.24 for a slower yorker
  probs.wicket += delVariance * 0.55;
  probs.six += delVariance * 0.45;
  probs.four += delVariance * 0.25;
  probs.dot -= delVariance * 0.25;
  probs.single -= delVariance * 0.25;
  probs.double -= delVariance * 0.15;
  probs.triple -= delVariance * 0.05;

  // Field influence — continuous, not a blunt threshold.
  // A well-set field (low score) cuts boundaries and creates dot balls;
  // a gap (high score) means the shot finds the fence.
  const fieldScore = field.score || 50;
  const fieldStrength = Math.max(0, 42 - fieldScore) / 42; // 0..1 how well-set
  probs.wicket += fieldStrength * 0.05;
  probs.four -= fieldStrength * 0.055;
  probs.six -= fieldStrength * 0.03;
  probs.dot += fieldStrength * 0.045;
  if (fieldScore > 75) {
    // Big gap — the ball beats the field
    probs.four += 0.055;
    probs.six += 0.03;
    probs.wicket -= 0.03;
  }

  // Pressure effect
  const pressure = (context.pressure || 0) / 100;
  probs.wicket += pressure * 0.05;
  probs.dot += pressure * 0.03;
  probs.four -= pressure * 0.02;

  // Ensure probabilities are valid
  normalizeProbs(probs);

  return probs;
}

function normalizeProbs(probs) {
  const keys = Object.keys(probs);
  let total = keys.reduce((sum, k) => sum + probs[k], 0);
  if (total <= 0) {
    // Fallback
    probs.dot = 0.30;
    probs.single = 0.25;
    probs.double = 0.10;
    probs.triple = 0.02;
    probs.four = 0.15;
    probs.six = 0.08;
    probs.wicket = 0.10;
    total = 1.0;
  }
  // Normalize to sum to 1
  keys.forEach(k => { probs[k] = Math.max(0, probs[k]) / total; });
}

function pickOutcome(probs, field) {
  const rand = Math.random();
  let cumulative = 0;

  const outcomes = [
    { key: 'dot', runs: 0, wicket: false, description: 'DOT BALL' },
    { key: 'single', runs: 1, wicket: false, description: 'SINGLE' },
    { key: 'double', runs: 2, wicket: false, description: 'TWO RUNS' },
    { key: 'triple', runs: 3, wicket: false, description: 'THREE RUNS' },
    { key: 'four', runs: 4, wicket: false, description: 'FOUR!' },
    { key: 'six', runs: 6, wicket: false, description: 'SIX!' },
    { key: 'wicket', runs: 0, wicket: true, description: 'WICKET!' },
  ];

  for (const outcome of outcomes) {
    cumulative += probs[outcome.key];
    if (rand <= cumulative) {
      if (outcome.key === 'wicket') {
        // Wicket type, biased toward Caught when a good fielder is in the way
        outcome.wicketType = determineWicketType(probs, field);
        if (outcome.wicketType === 'Caught' && field?.catchPosition) {
          outcome.isCatch = true;
          outcome.fielderInvolved = field.catchPosition.name;
          outcome.catchFielderName = field.catchPlayer?.name || null;
          outcome.description = `WICKET — CAUGHT at ${field.catchPosition.name}`;
        } else {
          outcome.description = `WICKET — ${outcome.wicketType}`;
        }
      }
      if (outcome.key === 'four') {
        outcome.description = `FOUR! ${getBoundaryDescription('four')}`;
      }
      if (outcome.key === 'six') {
        outcome.description = `SIX! ${getBoundaryDescription('six')}`;
      }
      return outcome;
    }
  }

  // Fallback
  return outcomes[0];
}

function determineWicketType(probs, field) {
  // Caught becomes more likely when the ball went near a fielder with good hands
  let caught = 0.35;
  if (field?.catchPosition && field?.catchPlayer && field.angleMatch !== 'wide') {
    const catching = field.catchPlayer.fielding?.catching ?? 70;
    caught += (catching - 50) / 120; // up to ~+0.4
    if (field.angleMatch === 'close') caught += 0.08;
  }
  caught = Math.min(0.6, caught);

  const types = [
    { type: 'Bowled', weight: 0.25 },
    { type: 'Caught', weight: caught },
    { type: 'LBW', weight: 0.20 },
    { type: 'Run Out', weight: 0.08 },
    { type: 'Stumped', weight: 0.08 },
  ];

  const total = types.reduce((s, t) => s + t.weight, 0);
  const rand = Math.random() * total;
  let cumulative = 0;
  for (const t of types) {
    cumulative += t.weight;
    if (rand <= cumulative) return t.type;
  }
  return 'Caught';
}

function getBoundaryDescription(type) {
  const fours = [
    'Beautiful timing!',
    'Cracking shot!',
    'Through the gap!',
    'Racing to the boundary!',
    'Exquisite placement!',
    'Pierces the field!',
  ];
  const sixes = [
    'Massive hit!',
    'Into the stands!',
    'What a shot!',
    'Huge! Over the boundary!',
    'Maximum!',
    'Clean strike!',
  ];
  const arr = type === 'four' ? fours : sixes;
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildExplanation(delivery, shot, bowler, batsman, outcome, matchup, bowlerExec, batsmanExec, fieldInfluence) {
  const delType = DELIVERY_TYPES[delivery.type];
  const shotType = SHOT_TYPES[shot.type];
  const line = LINES[delivery.line];
  const explanation = [];

  explanation.push(`Delivery: ${delType.name} on ${line.name}`);
  explanation.push(`Shot: ${shotType.name} at ${shot.power}% power`);
  explanation.push(`Matchup score: ${Math.round(matchup)}/100`);
  explanation.push(`Bowler execution: ${Math.round(bowlerExec)}/100`);
  explanation.push(`Batsman execution: ${Math.round(batsmanExec)}/100`);

  if (outcome.wicket) {
    explanation.push(`Result: ${outcome.wicketType} — Poor matchup for the batsman`);
    if (outcome.fielderInvolved) {
      explanation.push(`Field: ${outcome.fielderInvolved}${outcome.catchFielderName ? ` (${outcome.catchFielderName})` : ''} positioned perfectly`);
    }
  } else if (outcome.runs >= 4) {
    explanation.push(`Result: ${outcome.runs === 4 ? 'Boundary' : 'Six'} — Excellent matchup for the batsman`);
    if (fieldInfluence && fieldInfluence.angleMatch === 'wide') {
      explanation.push(`Field: hit through the gap — no fielder near ${getShotAngle(shotType.id) > 90 ? 'the leg side' : 'the off side'}`);
    }
  } else if (outcome.runs === 0) {
    explanation.push(`Result: Dot ball — ${bowlerExec > batsmanExec ? 'Bowler dominated' : 'Good delivery'}`);
    if (fieldInfluence && fieldInfluence.angleMatch !== 'wide') {
      explanation.push(`Field: ${fieldInfluence.catchPosition?.name || 'A fielder'} cut off the run`);
    }
  }

  return explanation;
}

// ============================================================
// GENERATE DELIVERY OPTIONS FOR BOWLER
// ============================================================

/**
 * Build a bowler's option pool weighted by their skills and archetype
 * (design doc points 21-22, 65-66). Spinners get spin deliveries, swing
 * bowlers get swinging lengths, express bowlers get yorkers/bouncers.
 * The result is always 3 DISTINCT options so choices are meaningful.
 */
function generateDeliveryOptions(bowler, matchContext) {
  const typeDef = BOWLER_TYPES[bowler.type];
  const isSpin = typeDef?.category === 'spin';

  // Pool of (type, line) candidates, weighted by skill × the type's library.
  // The bowler type decides WHAT they can bowl; skill decides frequency.
  const pool = [];
  const add = (type, line, weight) => {
    for (let i = 0; i < Math.max(1, Math.round(weight)); i++) pool.push({ type, line });
  };

  if (typeDef) {
    for (const [delId, cfg] of Object.entries(typeDef.deliveries)) {
      const skill = bowler[cfg.skill] || 60;
      const totalWeight = Math.max(0.5, skill * cfg.weight);
      for (const line of cfg.lines) {
        add(delId, line, totalWeight / cfg.lines.length);
      }
    }
  } else {
    // Fallback for unknown types — a generic safe pool (never offer an
    // impossible delivery)
    if (isSpin) {
      add('good_length', 'stumps', 3); add('off_break', 'stumps', 2); add('off_break', 'off', 2);
      add('leg_break', 'leg', 2); add('googly', 'stumps', 1); add('topspin', 'stumps', 1); add('full_tos', 'stumps', 1);
    } else {
      add('good_length', 'stumps', 3); add('good_length', 'off', 3); add('yorker', 'stumps', 2);
      add('short', 'leg', 2); add('slower_ball', 'stumps', 2); add('bouncer', 'leg', 1); add('full_tos', 'stumps', 1);
    }
  }

  // Pick 3 DISTINCT deliveries (by type + line)
  const picked = [];
  const used = new Set();
  let attempts = 0;
  while (picked.length < 3 && pool.length > 0 && attempts < 300) {
    attempts++;
    const cand = pool[Math.floor(Math.random() * pool.length)];
    const key = `${cand.type}|${cand.line}`;
    if (!used.has(key)) {
      used.add(key);
      picked.push(cand);
    }
  }

  // Fallback fill from the type's own library (stock deliveries first)
  const fallbackTypes = typeDef
    ? Object.keys(typeDef.deliveries)
    : (isSpin ? ['good_length', 'off_break', 'leg_break'] : ['good_length', 'yorker', 'short']);
  while (picked.length < 3) {
    const t = fallbackTypes[Math.floor(Math.random() * fallbackTypes.length)];
    const l = (typeDef?.deliveries[t]?.lines || ['stumps', 'off', 'leg'])[Math.floor(Math.random() * 3)];
    const key = `${t}|${l}`;
    if (!used.has(key)) {
      used.add(key);
      picked.push({ type: t, line: l });
    }
  }

  // Options carry type + line (+ internal default speed; NOT a choice).
  // `risky` flags high-variance variations for the UI.
  return picked.map(p => ({
    type: p.type,
    line: p.line,
    speed: DELIVERY_TYPES[p.type]?.defaultSpeed || 'fast',
    risky: (DELIVERY_TYPES[p.type]?.risk || 0) > 0.2,
    label: `${DELIVERY_TYPES[p.type]?.name || p.type} on ${LINES[p.line]?.name || p.line}`,
  }));
}

// ============================================================
// GENERATE SHOT OPTIONS FOR BATSMAN
// ============================================================
function generateShotOptions(batsman, deliveryHint = {}) {
  const allShots = Object.values(SHOT_TYPES);

  // Filter shots the batsman can actually play (skill gates)
  const available = allShots.filter(shot => {
    if (shot.category === 'aggressive' && (batsman.power || 50) < 40) return false;
    if (shot.id === 'reverse_sweep' && (batsman.technique || 50) < 70) return false;
    if (shot.id === 'hook' && (batsman.shortBall || 50) < 60) return false;
    // Innovation shots demand real skill — a slogger never sees them
    if (shot.id === 'scoop' && (batsman.technique || 50) < 65) return false;
    if (shot.id === 'ramp' && (batsman.technique || 50) < 60) return false;
    if (shot.id === 'reverse_lap' && (batsman.technique || 50) < 78) return false;
    if (shot.id === 'switch_hit' && (batsman.technique || 50) < 72) return false;
    if (shot.id === 'slog_sweep' && (batsman.power || 50) < 55) return false;
    if (shot.id === 'upper_cut' && (batsman.shortBall || 50) < 58) return false;
    return true;
  });
  const byId = (id) => available.find(s => s.id === id);

  // Which shots suit THIS delivery (cricketing logic, not random)
  const fits = DELIVERY_SHOT_FITS[deliveryHint.type] || DELIVERY_SHOT_FITS.good_length;
  const lineId = deliveryHint.line;

  const options = [];
  const used = new Set();
  const push = (shot, power) => {
    if (!shot || used.has(shot.id)) return false;
    options.push({ type: shot.id, power, label: shot.name });
    used.add(shot.id);
    return true;
  };
  const matchup = (shot) => getMatchupScore(deliveryHint, { type: shot.id, power: 60 });

  // --- THE 3 OFFERED SHOTS (design doc: one perfect read, one decent
  // option, one trap — SHUFFLED so the batsman must read the field) ---
  //
  // 1. PERFECT — the textbook counter for THIS delivery. For a yorker that is
  //    forward defence; for a short ball, back-foot defence; for spin, the
  //    sweep; for a wide-off line, the leave. Runs scale with confidence.
  // 2. DECENT — the best attacking counter (straight drive vs yorker, pull
  //    vs short, sweep vs spin). 1/2/3 runs, boundaries rarely.
  // 3. MISTAKE — the worst-matchup non-defensive shot at tempting power.
  //    A wicket unless confidence is high; then 0 or 1.

  let defensivePool = fits.defensive.map(byId).filter(Boolean);
  if (!['wide_off', 'off'].includes(lineId)) {
    defensivePool = defensivePool.filter(s => s.id !== 'leave');
  }
  const naturalPool = fits.natural.map(byId).filter(Boolean);

  // ROLE 1 — PERFECT: the textbook defensive read (forward defence vs yorker,
  // back-foot defence vs short, forward defence vs spin, leave on a wide line).
  // Prefer leave on wide-off lines — leaving is the correct defensive play.
  // Runs off this shot scale with batting confidence.
  let perfect = (['wide_off', 'off'].includes(lineId) && defensivePool.find(s => s.id === 'leave'))
    || defensivePool[0]
    || naturalPool[0];
  push(perfect, 55 + Math.floor(Math.random() * 16)); // 55-70% — the read

  // ROLE 2 — DECENT: the best CONTROLLED counter (straight drive vs yorker,
  // pull vs short, sweep vs spin, drives vs a full toss). We prefer ground/
  // defensive-category shots so the decent slot always represents a measured
  // cricket shot — innovation shots (scoop/ramp etc.) are high-risk and
  // belong in the mistake slot or as bonus picks.
  let decent = null;
  let decentScore = -1;
  // First pass: prefer non-aggressive naturals (ground / leg-side / defensive)
  for (const s of naturalPool) {
    if (used.has(s.id)) continue;
    if (s.category === 'aggressive') continue; // save innovation for mistake
    const sc = matchup(s);
    if (sc > decentScore) { decentScore = sc; decent = s; }
  }
  // Second pass: if no ground shot available, accept innovation
  if (!decent) {
    for (const s of naturalPool) {
      if (used.has(s.id)) continue;
      const sc = matchup(s);
      if (sc > decentScore) { decentScore = sc; decent = s; }
    }
  }
  if (!decent) {
    // No natural counter available (thin skill pool) — best remaining on-plan
    const onPlan = [...defensivePool, ...naturalPool].filter(s => !used.has(s.id));
    decent = onPlan[0] || null;
  }
  push(decent, 45 + Math.floor(Math.random() * 21)); // 45-65%

  // ROLE 3 — MISTAKE: the worst-matchup playable NON-defensive shot (leave is
  // never a mistake) — served at tempting high power. A wicket unless the
  // batsman is confident; then 0 or 1.
  const mistakeCandidates = available.filter(s => !used.has(s.id) && s.category !== 'defensive' && s.id !== 'leave');
  let mistake = null;
  let worst = Infinity;
  for (const s of mistakeCandidates) {
    const sc = matchup(s);
    if (sc < worst) { worst = sc; mistake = s; }
  }
  push(mistake, 78 + Math.floor(Math.random() * 18)); // 78-95%

  // Fallback: fill any missing slot from remaining playable shots
  const rest = available.filter(s => !used.has(s.id));
  while (options.length < 3 && rest.length > 0) {
    const pick = rest.splice(Math.floor(Math.random() * rest.length), 1)[0];
    push(pick, 45 + Math.floor(Math.random() * 46));
  }

  // Shuffle so the roles are never readable from position — the batsman
  // must read the field + bowler memory and back their read.
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  return options;
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  DELIVERY_TYPES,
  LINES,
  SPEEDS,
  SHOT_TYPES,
  BOWLER_TYPES,
  getBowlerTypeName,
  FIELD_POSITIONS,
  FIELD_PRESETS,
  mirrorAngle,
  getShotAngle,
  validateField,
  calculateOutcome,
  generateDeliveryOptions,
  generateShotOptions,
};
