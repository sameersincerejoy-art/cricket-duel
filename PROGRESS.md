# 🏏 CRICKET DUEL — Development Progress

> **Read this file first in every new session.** It records what exists, what was
> fixed, what is known to be broken, and what to build next.

**Concept (one line):** A two-player cricket *decision simulator* — the bowler picks a
hidden delivery, the batsman picks a shot, and a rules-driven engine (player attributes,
confidence, pressure, field placement) determines the outcome. Not a reflex game: a game
of reading and prediction. Full design doc: 112 points ("CRICKET DUEL — THE EXPANDED
CONCEPT").

---

## 1. How to run

```bash
npm run dev          # server (port 3001) + Vite client together
npm run server       # node server/index.js  (listens on 0.0.0.0:3001)
npm run client       # Vite dev server
npm run build        # production build (served by the server when NODE_ENV=production)
```

Two players: host creates a match (2–10 overs), shares the 6-digit code; guest joins.
Both phones reach the host's IP:port 3001 (same Wi-Fi/hotspot).

**Verification:**

```bash
node scripts/verify-engine.js   # engine rules: field legality, no-ball/wide scoring,
                                # over limits, option generation, match length (~1s)
node scripts/flow-test.js       # end-to-end 2-over match with 2 fake socket clients (~70s):
                                # completion, hidden-info isolation, role rejection,
                                # over-limit rejection, timer auto-pick, timeline
node scripts/visual-test.js     # REAL headless-Chrome browser plays a full match against
                                # a socket client; screenshots every screen into
                                # scripts/shots/ and asserts NO horizontal overflow and
                                # NO overlapping option cards (~90s). Needs Chrome.
node scripts/player-tests.js    # 5 real-player strategy scenarios (Slayer / Grinder /
                                # Trap / Chaser / Marathon) with a full invariant battery;
                                # deterministic via seeded PRNG — zero flakiness (~30s)
```

---

## 2. Architecture

```
engine/              Pure Node logic (CommonJS, no deps)
  cricketEngine.js   Delivery/shot/field libraries, matchup scoring, outcome
                     probabilities, option generation, field-legality rules
  gameEngine.js      MatchEngine: innings, overs, balls, striker/non-striker,
                     confidence, pressure, over limits, scorecard
  autoTeam.js        Balanced fictional XIs (11 players, attributes, personality)
server/index.js      Socket.IO: match codes, toss, per-role event targeting, role +
                     legality + over-limit validation, decision timer, memory, timeline
client/src/          React (Vite)
  App.jsx            Socket event routing + screens (innings-break auto-advance)
  components/        Lobby (overs chips), MatchLobby (team card + attrs), Toss,
                     Match (sticky score header, status card, scroll body),
                     FieldView (drag/tap-to-move fielders, position picker,
                     fielder initials, legend), BowlerSelect (over limits),
                     BowlingPanel (batsman memory + timer), BatsmanPanel
                     (bowler memory + timer), BallResult (WHY), Scorecard (timeline)
  index.css          Full design system: tokens, type scale, spacing, elevation,
                     tabular numerals, safe areas, pinned action bars
scripts/             verify-engine.js, flow-test.js, visual-test.js
```

**Networking:** host-authority — server computes everything, only decisions travel.
The batsman's phone NEVER receives the delivery options (verified by flow test).

---

## 3. The 10-part audit (design doc → build status)

Legend: ✅ built & verified · 🟡 partial · ⏳ deferred (documented, not built)

| # | Part (doc points) | Status | Notes |
|---|---|---|---|
| 1 | **Core pillars & match structure** (1–2) | ✅ | Full flow works: create → lobby → toss → innings 1 → over breaks → innings 2 → result. Engine is explainable (WHY button). Hidden info + visible info + attributes + simulation all present. |
| 2 | **Team creation & player attributes** (3–10) | 🟡 | Auto XI with full batting/bowling/fielding attributes + personalities ✅. Attributes now visible via expandable cards in the team lobby. Manual player/team creation, team-composition strategy (batter/bowling heavy) ⏳. |
| 3 | **Match length, toss, pitch, weather** (11–15) | 🟡 | 2–10 overs ✅, interactive toss ✅ (now only the winner can choose). Pitch system (flat/green/dry/dusty) ⏳. Weather ⏳ (doc says don't put in first prototype). |
| 4 | **Fielding screen, presets, rules, position math** (16–19) | ✅ | Top-down field ✅, 8 presets ✅, **fielding laws enforced** ✅ (≤5 on leg side, ≤5 outside circle, ≤2 behind square on leg — illegal fields rejected with explanation). **Manual field editing** ✅ (drag a fielder with snap-to-position, or tap-select → position picker; illegal moves roll back with an explanation). **Fielding MATTERS** ✅: 11-player roster auto-assigned by fielding skill (best hands at slip/point), fielder catching/reflex used in catch chances, continuous field influence (well-set field cuts boundaries, gaps leak fours), WHY explains "caught at deep midwicket". |
| 5 | **Bowling screen, bowler types, execution** (20–24) | ✅ | Delivery options are now **bowler-type & skill-weighted** (spinner vs pace vs swing), always 3 distinct choices. Execution quality = skill × confidence × pressure × variance ✅. Archetype-specific option pools (express/swing/seam) 🟡 — currently pace is one pool; deeper archetypes ⏳. |
| 6 | **Batting screen, shots, power, timing** (25–31) | ✅ | **Shot options are now delivery-aware** — a yorker always offers forward defence, a short ball offers back-foot defence + pull/cut, spin offers sweep/paddle; options filtered by batsman skill; power = risk/reward ✅; hidden timing in engine ✅. |
| 7 | **Cricket engine: outcome, explanations, confidence, pressure** (32–39) | ✅ | Probabilities not raw randomness ✅; WHY explanation ✅; batsman+bowler confidence (bounded) ✅; pressure from required run rate ✅. **No-ball/wides now score correctly** ✅ (batted runs + extra, no wicket off a no-ball, no ball faced). |
| 8 | **Memory, tendencies, personality, fatigue, over limits** (40–46) | 🟡 | **Bowler over limits enforced + displayed** ✅ ("BOWLER LIMIT: N OVERS"). **Memory implemented** ✅ — batsman sees the bowler's last 6 balls, bowler sees the batsman's last 6 shots. Tendency system (hidden counters) ⏳. Fatigue ⏳ (doc: keep subtle). Personality data exists but unused by engine ⏳. |
| 9 | **Modes, Cricket IQ, analysis, timeline, commentary** (47–51) | 🟡 | **Ball-by-ball timeline with tap-to-view decisions** ✅ on the scorecard. Commentary text via outcome descriptions ✅. Quick/Expert modes ⏳. Cricket IQ rating ⏳. Post-match analytics ⏳. |
| 10 | **Multiplayer, AI, career, anti-cheat, performance** (52–112) | 🟡 | Hotspot multiplayer ✅, host authority ✅, role-based anti-cheat ✅, **gzip compression for fast loading** ✅. Single-player AI ⏳ (must follow same rules — no cheating). Career/tournaments/leagues ⏳. Replays/spectator ⏳. Monetization ⏳ (never pay-to-win). |

---

## 4. Session log

### Session 1 — resume after interruption

MVP existed but was **never verified end-to-end**; multiple game-breaking bugs found
and fixed: innings off-by-one (13 balls/innings), hidden-information leak (both phones
saw everything), server crashes (`callback is not a function` on `start_toss`/
`change_field`; missing `generateShotOptions` import), wrong batsman scoring after
wickets, wrong "won by X wickets" margin, wrong scorecard overs. Added role isolation,
server-side role validation, 15s decision timer with auto-conservative fallback,
`scripts/flow-test.js`, `PROGRESS.md`.

### Session 3 — world-class UI overhaul (design-system pass)

Rebuilt the whole client as a proper design system (stadium-night theme inspired
by Dream11 / Real Cricket): token-driven CSS (Inter + Sora fonts, spacing/type/
radius/elevation scales, tabular numerals, safe-area insets), consistent screens,
sticky blurred score header, scrollable match body, **pinned bottom action bars**,
edge-aware field (legend chips instead of labels that collided), result hero,
scorecard hero + timeline accordion, redesigned lobby/toss/panels.

**Two real bugs found by the new `scripts/visual-test.js`** (a headless-Chrome
player plays a full match against a socket client, screenshots every screen, and
asserts zero horizontal overflow + zero overlapping option cards):
1. **Client hardcoded socket port 3001** — on any other port the app could not
   connect (buttons stayed disabled). Now derived from the page origin in
   production, fixed at 3001 only for Vite dev.
2. **Match stalled forever at the innings break** — the server broadcasts
   `match_state` without a `phase`, so clients stayed on the break screen and
   the bowler-select UI never appeared. Client now auto-advances to
   `bowler_select` 4.5s after the break.

Also added: `currentBowler` (name/type) to `match_state` for the new status card.

**Verified:** engine 13/13 ✅ · flow-test all ✅ · **visual-test PASSED** — 14
screenshots in `scripts/shots/`, zero overflow, zero overlap ✅ · client builds
clean (~218 KB JS, 67 KB gzipped).

### Session 5 — fielding is now a real decision layer

**Manual field editing** (design doc points 16-19): the bowling captain can now
reposition fielders — **drag** a dot (snaps to the nearest named position) or
**tap a dot → position picker** → tap a destination (swaps if occupied). Every
move is validated server-side against the fielding laws; illegal moves roll back
with the explanation ("MAXIMUM 5 FIELDERS ON LEG SIDE"). A "✕ Done" chip closes
the picker.

**Fielding now matters mathematically** (points 19, 68-69):
- **Roster**: the bowling side's 11 players are auto-assigned to the 11 fielding
  positions by fielding skill — best all-round fielders to slip/point/close-in.
- **Catching**: lofted shots near a fielder with good catching/reflex become
  wickets far more often; wicket types are biased toward Caught at the
  fielder's position ("WICKET — CAUGHT at Deep Midwicket (A. Sharma)").
- **Continuous field influence**: a fielder on the shot's line cuts boundaries
  and creates dots; a gap in the field leaks fours/sixes. Verified
  statistically in the engine tests.
- **WHY** explains the field's role in every result.
- Field changes persist across balls/overs but **reset per innings** (the new
  fielding side starts fresh — a real bug found by the flow test).
- Dots show the fielder's initial; the legend lists position + fielder.

**Verified:** engine **27/27** (roster, movement, persistence, swap, boundary
cut, catching skill) · flow-test all ✅ (valid move, illegal-move rejection,
roster payloads) · visual-test PASSED incl. **15-field-edit.png** (picker open,
zero overflow) ✅.

### Session 8 — 5 real-player test scenarios + fielding-logic fix

Wrote `scripts/player-tests.js` — 5 tests that play like real players:

| Test | Player | Verifies |
|---|---|---|
| T1 Slayer | Slogs every ball at 95% power | High-risk batting is punished: more wickets, mixed output |
| T2 Grinder | Defends / rotates at low power | Low-risk batting survives: few wickets, low-ish scoring |
| T3 Trap | Captain packs the deep leg boundary vs a gap | A set field catches more and concedes fewer runs than a gap |
| T4 Chaser | Guest bats first, then chases | Chase target correct, first-innings score preserved |
| T5 Marathon | Long 5-over match, both innings | Over limits, scorecard, no engine hangs at scale |

Every scenario runs a full invariant battery: exact ball counts, scorecard
consistency, over limits, chase target, no-ball/wides, hidden-info isolation.

**Bugs found and fixed:**
1. **MAJOR — innings wipe (affects ~half of all real matches):** when team 1
   batted first, the innings break wiped their first-innings score (e.g. 7→0)
   and the chase target collapsed to 1. `startInnings` reset score arrays by
   *innings index* while everything else uses *team index* — now fixed to use
   the team index. Confirmed by T4 before/after.
2. **Engine silently accepted non-bowlers:** `setBowler` now rejects a player
   who can't bowl (a real captain can't pick an opener to bowl).
3. **Aerial catches:** a lofted shot can only be caught by an **outfield**
   fielder (the ball flies over the ring) — the engine previously let a
   close-in fielder catch a ball hit over their head. This also made the
   trap-vs-gap test meaningful: with the deep leg boundary genuinely open,
   the trap converts far more lofted shots into wickets.
4. **T3's "gap" wasn't a gap:** it still had deep_square (100°) near the
   lofted-leg arc (145°). Rebuilt so the deep leg side is truly open — the
   test is now a real trap-vs-gap comparison.
5. **Flaky statistics → deterministic tests:** the tests were failing ~1-in-3
   runs on tight margins. Seeded the PRNG (mulberry32) per scenario/rep so
   the suite is 100% reproducible.

**Verified:** player-tests 5/5 across repeated runs · engine **28/28** ·
flow-test all ✅ (×3) · visual-test PASSED ✅.

**Also fixed while testing:** the flow test fired its field-editing assertions on
the first `match_state` — before a bowler was selected, so the roster was still
empty. It now waits for a match_state that actually carries the 11-player roster.

### Session 7 — real-player-style names & roles (auto team fix)

Auto-generated names used to be random first-name + last-name combos, which
produced awkward misfits ("Virat Sharma") and names whose role contradicted
the real cricketer. Replaced with **per-role name pools** in `engine/autoTeam.js`:

- Names are recognizable-but-fictional versions of real players ("N.S. Dhoni",
  "K. Bumrah", "R. Kohli") — same surname, changed initials.
- **Role always matches the original cricketer**: a Dhoni is always the
  wicketkeeper, a Bumrah always a fast bowler, a Kohli always top order.
  (Name pools are keyed by the role the real player actually plays.)
- **No duplicate players across the two teams** — `generateAutoTeam` now
  accepts a shared `used` Set; the server passes one set for both teams.
- Team names / short names also can't collide between the two sides
  (previously team 1 only avoided `TEAM_NAMES[0]`, not the name actually
  picked — fixed, now tracked in the same shared set).

Verified: engine 28/28 · player-tests 5/5 · flow-test all ✅ · visual-test
PASSED ✅. Sample generated XIs look right (see session log above for a
printed example: Superstars vs Eagles, 22 unique players).

### Session 4 — delivery-aware shot options (cricketing logic)

The batsman's 3 shot options used to be random (any defensive + any ground + any
attacking shot). Now they are **generated from the bowler's actual delivery**
(`DELIVERY_SHOT_FITS` map mirroring the engine's matchup rules):

- **Yorker / wide yorker** → forward defence always offered (+ leave vs wide),
  straight drive / flick / cover drive — never pull/hook.
- **Short ball / bouncer** → back-foot defence always, pull/cut/hook — never
  front-foot drives.
- **Full toss** → drives/lofted — never pull/hook.
- **Spin** → forward defence + sweep/paddle always available.
- **Good length / slower ball** → defence + drives.
- Leave only appears against outside-off lines.
- The **textbook counter** for the delivery is always one of the options (sweep
  vs spin, pull vs short, straight drive vs yorker) at mid power, plus one
  random higher-power option — so choices stay meaningful and unreadable.
- Skill gates unchanged (a batsman who can't play the hook never sees it).

Verified: engine now **18/18** (6 new delivery-specific assertions) · flow-test
all ✅ · visual-test PASSED ✅.

### Session 2 — full 10-part audit (senior-dev review pass)

- **Field legality (part 4):** implemented cricket's fielding laws — max 5 fielders on
  the leg side, max 5 outside the 30-yard circle, max 2 behind square on leg. Several
  presets were illegal (balanced 6 leg-side, death 6 outside circle, spin/leg-trap
  overloaded) — all rebuilt to be legal; server rejects illegal fields with an
  explanation; field buttons hidden from the batting side.
- **No-ball/wide scoring (part 7):** outcome now separates batted runs from extras.
  No-ball = batted runs + 1 extra, no ball faced, **no wicket possible**; wide = 1
  extra only. Bowler figures and scorecard updated to match.
- **Bowling options (part 5):** rewritten from pure random to skill/bowler-type
  weighted pools (spinner gets spin variations, yorker specialists get more yorkers,
  swing bowlers get swing) with guaranteed 3 distinct options.
- **Over limits (part 8):** max overs per bowler = max(1, ceil(totalOvers/3)) — e.g.
  1 for 2 overs, 2 for 5, 4 for 10. Server rejects exhausted bowlers; UI shows
  "BOWLER LIMIT" and per-bowler overs.
- **Memory (part 8):** batsman sees the bowler's last 6 deliveries; bowler sees the
  batsman's last 6 shots — the core "read your opponent" loop from doc points 40–41.
- **Timeline (part 9):** ball-by-ball match timeline on the scorecard; tap any ball to
  see delivery, shot, power and explanation.
- **Attributes UI (part 2):** team lobby players now expand to show batting/bowling/
  fielding attribute bars.
- **Toss (part 3):** only the toss winner can choose bat/bowl.
- **Performance (part 10):** gzip compression middleware; client stays ~216 KB (66 KB
  gzipped).

**Verified:** `scripts/verify-engine.js` 13/13 ✅ · `scripts/flow-test.js` all ✅
(repeated runs) · 100-match engine stress sim 100% complete, ball counts correct ·
client builds clean.

---

## 5. Known issues / limitations (next-fix candidates)

1. **Bowler archetypes are shallow** (part 5): swing/seam/express all share one pace
   pool; only spin vs pace differ strongly. Doc wants distinct option libraries per
   archetype (points 21–22).
2. **Personality traits unused** (part 8): `player.personality` (aggression, patience,
   risk appetite…) is generated but the engine ignores it. Wiring it into option
   generation/outcomes would add identity.
3. **No tendency tracking** (part 8): hidden counters for pull/drive/leave tendencies
   etc. not implemented; only the visible memory lists exist.
4. **No manual team/player creation** (part 2) — auto XI only.
5. **No pitch/weather** (part 3) — engine has no condition modifiers yet.
6. **No single-player AI** (part 10) — the doc insists the AI follow the same rules
   with no cheating; design needed before building.
7. **No difficulty/modes** (part 9): Quick/Expert/Purist modes and decision-quality
   ratings not started.
8. **Bowling plans / batting plans / captain's plan** (points 70–72) not started.
9. ~~Fielding skill not used in catch logic~~ **DONE** — fielder catching/reflex now
   drive catch chances and wicket types (Session 5).
10. **Timer fixed at 15s** for both roles (doc: 10s bowling/batting, 8s expert).

---

## 6. Roadmap (from the 112-point design doc)

**Phase 1 — MVP (≈done).** Local multiplayer, auto teams, toss, field presets + legality,
bowling/shot choice, confidence, pressure, scorecard, timeline, timer, memory, over
limits. Remaining polish: fielding-skill in catches, archetype pools, personality wiring.

**Phase 2 — Expert layer.** Suggested order:
1. Wire personality/tendencies into the engine (points 42–43)
2. Use fielder attributes in catch/run-out math (point 19)
3. Decision-quality rating + richer WHY (points 34–35, 78–79)
4. Pitch system (point 14)
5. Bowling plans / batting plans (points 70–71)
6. Fatigue (point 44)

**Phase 3 — Game layer.** Career, team career, tournaments, leagues (57–61), Cricket
IQ (48), modes (47).

**Phase 4 — Community layer.** Online multiplayer, spectator, replays, leaderboards
(88–90), AI single player (55–56).

---

### Session 9 — bowler-type redesign + shot-role system + wide/lap logic

**Goal:** implement the user's core design: 10 named bowling styles with
restricted delivery libraries, a delivery+line-only bowling UI (length removed),
3-role shot suggestions (perfect / decent / mistake), confidence-driven
outcome bands, marginal-line wide logic with the lap-conversion rule, and
a field-change flash for the batting side.

**Engine changes (`cricketEngine.js`):**
- **BOWLER_TYPES** added: 10 types — Right-Arm Fast, Left-Arm Fast,
  Right/Left-Arm Fast-Medium, Right/Left-Arm Medium, Off-Spin, Leg-Spin,
  Slow Left-Arm Orthodox, Left-Arm Wrist-Spin (Chinaman). Each has a
  delivery library of allowed deliveries + legal lines, driven by the
  bowler's attributes.
- **`arm_ball`** delivery added for SLA.
- **`generateDeliveryOptions`** rewritten: the bowler type's library decides
  WHAT they can bowl (a fast bowler never gets an off break; a spinner never
  gets a bouncer). The bowler picks **delivery type + line** only — there
  is NO separate length/speed choice anymore (length is implied by the
  delivery type). Options carry `risky` flag for high-variance variations.
- **`generateShotOptions`** rewritten as the 3-role system:
  1. **Perfect** = textbook defensive read (forward defence vs yorker,
     back-foot defence vs short, sweep vs spin, leave on wide-off).
  2. **Decent** = best attacking counter (straight drive vs yorker, pull vs
     short, sweep vs spin) — ground shots preferred over innovation.
  3. **Mistake** = worst-matchup non-defensive shot at tempting power
     (hook vs yorker = the trap; ramp vs spin = the trap).
  All 3 are **shuffled** so the batsman cannot read roles from position.
- **Marginal-line wide logic**: deliveries on `wide_off`, `wide_leg`, or
  `behind` (down leg) are only legal if the shot can reach that zone:
  - `wide_off` + off-side shot → legal; + leave → **WIDE**.
  - Down leg + scoop/paddle/reverse_lap → legal IF batConf > bowlConf
    (lap conversion → weighted 4/6); else → **WIDE**.
  - Down leg + any other shot → **WIDE** (can't reach).
- **Confidence bands** replace the old flat matchup bonus:
  - Matchup < 35 (mistake): wicket 34%→4% as confidence rises; mostly 0/1
    at high confidence.
  - Matchup 35–58 (decent): 1/2/3 runs; boundaries only when confident.
  - Matchup > 58 (perfect): scoring scales with batting confidence.
- **Real bug fixed**: bowler execution was reusing the **batsman's** confidence
  in `calculateExecution`. Now split into `bowlerConfidence` and
  `batsmanConfidence` in the context (fixed in `gameEngine.js` too).
- **Real bug fixed**: slog sweep + switch hit were double-counted in the
  matchup engine (+8 in the spin block AND +10 in the innovation block),
  making them always beat the sweep. Removed the spin-block duplicate.

**`gameEngine.js`:** context now carries both `batsmanConfidence` and
`bowlerConfidence`.

**`autoTeam.js`:** bowlers now get the 10 real types (e.g. Bumrah →
`right_arm_fast`, Ashwin → `right_arm_off_spin`, Jadeja →
`slow_left_arm_orthodox`, Kuldeep → `left_arm_wrist_spin`). Both teams
share one name set, no duplicates. `typeName` added to every bowler.

**Server (`index.js`):**
- `typeName` added to `get_bowling_options`, `bowler_choose_delivery`,
  `batsman_choose_shot`, and `match_state` payloads.
- Delivery validation: `choose_delivery` now checks the delivery type + line
  are in the bowler type's library. A fast bowler trying to bowl an off
  break is rejected with a cricketing explanation.

**Client:**
- `BatsmanPanel`: shows bowler type name (`Right-Arm Fast`, `Off-Spin`,
  etc.) and a hint: "You know the bowler type, not the delivery."
- `BowlingPanel`: shows the bowler's type name + "Pick the delivery type
  and line"; risky variations get a ⚠ badge and warning description;
  speed info removed from the option desc.
- `BowlerSelect`: shows `typeName` on each bowler card.
- `Match.jsx`: status card uses `typeName`; FieldView receives `flashKey`
  for the batting side.
- `FieldView`: **field-change flash** — a brief blue glow animation
  (750ms) on the field graphic whenever the bowling captain changes the
  field, so the batting side is visually notified.
- `App.jsx`: sets `fieldFlashKey: Date.now()` on `field_changed`.
- `index.css`: `fieldGlow` keyframe animation.

**Tests:** 310 engine checks, 5 player scenarios (0 failures), flow test
all pass, visual test PASSED. New test sections cover BOWLER_TYPES validity,
per-type isolation (fast never gets spin, spin never gets pace-only),
marginal-line wide logic (6 specific scenarios + lap conversion rate),
shot role structure (defence + counter + mistake for yorker/short/spin/
bouncer), confidence bands (mistake/defence/counter respond to confidence),
and innings score preservation through the break.

---

## 7. Conventions / notes

- Engine files are CommonJS, zero dependencies — keep them testable in isolation.
- Every outcome must be explainable by cricket logic ("if an outcome cannot be
  explained by cricket logic, the engine isn't finished").
- The server is authoritative; never send hidden state (delivery choice, RNG) to the
  other phone.
- No test framework — `node scripts/verify-engine.js` + `node scripts/flow-test.js`
  + `node scripts/visual-test.js` are the verification gates. Run all three after
  any server/engine/client change.
- Client: use the design-system classes in `index.css` — do NOT add inline styles
  (they cause the alignment drift this pass removed). Tokens are CSS variables.
- The project is **not** a git repository (no `.git`).
