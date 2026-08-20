import { useState, useRef, useCallback, useEffect } from 'react'

// Field position data (mirrored from engine for client-side rendering)
// Batter-centred: 0° = toward bowler, + = off side, − = leg side.
// Mirror of engine FIELD_POSITIONS — uses centre angle + centre distance
// for rendering.  Zone metadata (angleMin/Max, rMin/Max) is for UI highlights.
const FIELD_POSITIONS = {
  // Close catchers
  slip:        { id: 'slip',        name: 'Slip',          angle: 157, r: 14.5, zone: 'off' },
  slip_2:      { id: 'slip_2',      name: '2nd Slip',      angle: 147, r: 16,   zone: 'off' },
  slip_3:      { id: 'slip_3',      name: '3rd Slip',      angle: 137, r: 17.5, zone: 'off' },
  gully:       { id: 'gully',       name: 'Gully',         angle: 115, r: 20,   zone: 'off' },
  silly_point: { id: 'silly_point', name: 'Silly Point',   angle:  95, r: 12.5, zone: 'off' },
  short_leg:   { id: 'short_leg',   name: 'Short Leg',     angle: 252, r: 12.5, zone: 'leg' },
  leg_gully:   { id: 'leg_gully',   name: 'Leg Gully',     angle: 225, r: 16,   zone: 'leg' },
  leg_slip:    { id: 'leg_slip',    name: 'Leg Slip',      angle: 210, r: 14.5, zone: 'leg' },
  // Inner ring
  point:                { id: 'point',                name: 'Point',                angle:  87, r: 24,   zone: 'off' },
  backward_point:       { id: 'backward_point',       name: 'Backward Point',       angle: 102, r: 26,   zone: 'off' },
  cover_point:          { id: 'cover_point',          name: 'Cover Point',          angle:  72, r: 25,   zone: 'off' },
  cover:                { id: 'cover',                name: 'Cover',                angle:  57, r: 27.5, zone: 'off' },
  extra_cover:          { id: 'extra_cover',          name: 'Extra Cover',          angle:  42, r: 27.5, zone: 'off' },
  silly_mid_off:        { id: 'silly_mid_off',        name: 'Silly Mid-Off',        angle:  20, r: 12.5, zone: 'off' },
  short_mid_off:        { id: 'short_mid_off',        name: 'Short Mid-Off',        angle:  17, r: 18.5, zone: 'off' },
  mid_off:              { id: 'mid_off',              name: 'Mid Off',              angle:  17, r: 30,   zone: 'off' },
  silly_mid_on:         { id: 'silly_mid_on',         name: 'Silly Mid-On',         angle: 340, r: 12.5, zone: 'leg' },
  short_mid_on:         { id: 'short_mid_on',         name: 'Short Mid-On',         angle: 342, r: 18.5, zone: 'leg' },
  mid_on:               { id: 'mid_on',               name: 'Mid On',               angle: 342, r: 30,   zone: 'leg' },
  short_midwicket:      { id: 'short_midwicket',      name: 'Short Mid-Wicket',     angle: 315, r: 18.5, zone: 'leg' },
  midwicket:            { id: 'midwicket',            name: 'Midwicket',            angle: 307, r: 28.5, zone: 'leg' },
  short_square_leg:     { id: 'short_square_leg',     name: 'Short Square Leg',     angle: 267, r: 18.5, zone: 'leg' },
  square_leg:           { id: 'square_leg',           name: 'Square Leg',           angle: 265, r: 27,   zone: 'leg' },
  forward_square_leg:   { id: 'forward_square_leg',   name: 'Forward Square Leg',   angle: 247, r: 25,   zone: 'leg' },
  backward_square_leg:  { id: 'backward_square_leg',  name: 'Backward Square Leg',  angle: 287, r: 30,   zone: 'leg' },
  short_fine_leg:       { id: 'short_fine_leg',       name: 'Short Fine Leg',       angle: 212, r: 20,   zone: 'leg' },
  fine_leg:             { id: 'fine_leg',             name: 'Fine Leg',             angle: 207, r: 40,   zone: 'leg' },
  short_third_man:      { id: 'short_third_man',      name: 'Short Third Man',      angle: 125, r: 25,   zone: 'off' },
  third_man:            { id: 'third_man',            name: 'Third Man',            angle: 140, r: 57.5, zone: 'off' },
  // Boundary / outfield
  deep_gully:            { id: 'deep_gully',            name: 'Deep Gully',            angle: 112, r: 47.5, zone: 'off' },
  deep_point:            { id: 'deep_point',            name: 'Deep Point',            angle:  92, r: 55,   zone: 'off' },
  deep_backward_point:   { id: 'deep_backward_point',   name: 'Deep Backward Point',   angle: 107, r: 57.5, zone: 'off' },
  deep_cover:            { id: 'deep_cover',            name: 'Deep Cover',            angle:  60, r: 57.5, zone: 'off' },
  deep_extra_cover:      { id: 'deep_extra_cover',      name: 'Deep Extra Cover',      angle:  42, r: 57.5, zone: 'off' },
  cover_sweeper:         { id: 'cover_sweeper',         name: 'Cover Sweeper',         angle:  60, r: 57.5, zone: 'off' },
  deep_mid_off:          { id: 'deep_mid_off',          name: 'Deep Mid-Off',          angle:  17, r: 50,   zone: 'off' },
  long_off:              { id: 'long_off',              name: 'Long Off',              angle:  12, r: 62.5, zone: 'off' },
  deep_mid_on:           { id: 'deep_mid_on',           name: 'Deep Mid-On',           angle: 342, r: 50,   zone: 'leg' },
  long_on:               { id: 'long_on',               name: 'Long On',               angle: 347, r: 62.5, zone: 'leg' },
  deep_midwicket:        { id: 'deep_midwicket',        name: 'Deep Midwicket',        angle: 307, r: 57.5, zone: 'leg' },
  cow_corner:            { id: 'cow_corner',            name: 'Cow Corner',            angle: 317, r: 62.5, zone: 'leg' },
  deep_square:           { id: 'deep_square',           name: 'Deep Square Leg',       angle: 275, r: 57.5, zone: 'leg' },
  deep_backward_square:  { id: 'deep_backward_square',  name: 'Deep Backward Square',  angle: 292, r: 57.5, zone: 'leg' },
  deep_fine_leg:         { id: 'deep_fine_leg',         name: 'Deep Fine Leg',         angle: 205, r: 62.5, zone: 'leg' },
  long_leg:              { id: 'long_leg',              name: 'Long Leg',              angle: 225, r: 57.5, zone: 'leg' },
  deep_third_man:        { id: 'deep_third_man',        name: 'Deep Third Man',        angle: 142, r: 62.5, zone: 'off' },
}

const FIELD_PRESETS = {
  balanced:   { name: 'Balanced' },
  attacking:  { name: 'Attacking' },
  defensive:  { name: 'Defensive' },
  death:      { name: 'Death' },
  powerplay:  { name: 'Powerplay' },
}

// Convert batter-centred angle to visual (CSS) angle for the field view.
//
// Batter-centred: 0° = toward bowler, + = off side, − = leg side.
// Visual (screen): 0° = up, 90° = right, 180° = down, 270° = left.
//
// In the field view the batter is at the TOP and the bowler at the BOTTOM.
//   RH: off-side = LEFT → batter +180° maps to visual 270° (left).
//   LH: off-side = RIGHT → batter +180° maps to visual  90° (right).
//
// Mapping:
//   RH: visual = (batterAngle + 180) % 360
//   LH: visual = (−batterAngle + 180 + 360) % 360
const visualAngle = (batterAngle, handedness) => {
  if (handedness === 'left') {
    return (-batterAngle + 180 + 360) % 360
  }
  return (batterAngle + 180) % 360
}

// Pitch centre = field-view centre = (50%, 50%).
// The boundary ring CSS is inset: 7% → ring radius = 43% from centre.
// Max boundary distance ≈ 75 m → scale = 43 / 75 ≈ 0.573.
// 30-yard circle at 27.43 m → 27.43 × 0.573 ≈ 15.7% from centre.
const PITCH_CX = 50
const PITCH_CY = 50
const FIELD_SCALE = 0.573   // metres → % of field-view radius
const MAX_DISTANCE = 75     // metres — furthest boundary fielder
const RESTRICTION_R_PCT = 15.7 // 30-yard circle as % of field radius

// Position → % coordinates inside the field circle.
// Origin = pitch centre; pos.r is centre distance in metres.
const getPct = (pos, handedness) => {
  const angle = visualAngle(pos.angle, handedness)
  const angleRad = (angle - 90) * (Math.PI / 180)
  const distPct = (pos.r / MAX_DISTANCE) * 43 // 43% = boundary ring radius
  return {
    left: PITCH_CX + distPct * Math.cos(angleRad),
    top: PITCH_CY + distPct * Math.sin(angleRad),
  }
}

export default function FieldView({ fielders = [], fieldPreset = 'balanced', onPresetChange, onMoveFielder, fielderRoster = {}, flashKey = null, strikerHanded = 'right', ballTrail = null, trailReset = 0 }) {
  const isLeftHanded = strikerHanded === 'left'

  const editable = typeof onMoveFielder === 'function'
  const [selected, setSelected] = useState(null)
  const [dragging, setDragging] = useState(null) // { fromPos, xPct, yPct }
  const [snapTarget, setSnapTarget] = useState(null)
  const [flash, setFlash] = useState(false)
  const fieldRef = useRef(null)
  const dragRef = useRef(null)

  // Ball trail animation state
  const [trail, setTrail] = useState(null) // { x, y, type, label, key }
  const trailTimerRef = useRef(null)

  // Field-change notification for the batting side: a brief glow on the
  // field graphic whenever the bowling captain changes the field.
  useEffect(() => {
    if (!flashKey) return
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 750)
    return () => clearTimeout(t)
  }, [flashKey])

  // Ball trail animation — triggered when a new ball_result arrives.
  // Calculates the target position based on shot angle and outcome,
  // then triggers a CSS transition. The trail auto-clears after a short delay.
  useEffect(() => {
    if (!ballTrail) { setTrail(null); return }

    // Clear any pending timer from a previous trail
    if (trailTimerRef.current) clearTimeout(trailTimerRef.current)

    const { shotAngle, runs, wicket, isWide, isNoBall, wicketType } = ballTrail

    // Determine how far the ball travels (fraction of field radius)
    // Field boundary is at distance 0.93 from center
    let distancePct // 0 = pitch center, 100 = boundary edge
    let trailType // CSS class for animation style
    let label = ''

    if (wicket) {
      if (wicketType === 'Caught') {
        // Ball flies to the nearest fielder in the shot direction
        distancePct = 65
        trailType = 'caught'
        label = 'W'
      } else {
        // Bowled / stumped — ball stays at pitch
        distancePct = 0
        trailType = 'wicket-other'
        label = 'W'
      }
    } else if (isWide || isNoBall) {
      distancePct = 25
      trailType = 'extra'
    } else if (runs === 0) {
      // Dot ball — brief pulse at pitch
      distancePct = 0
      trailType = 'dot'
    } else if (runs === 1) {
      distancePct = 22
      trailType = 'run'
    } else if (runs === 2) {
      distancePct = 38
      trailType = 'run'
    } else if (runs === 3) {
      distancePct = 55
      trailType = 'run'
    } else if (runs === 4) {
      distancePct = 93 // boundary ring
      trailType = 'four'
      label = '4'
    } else if (runs >= 6) {
      distancePct = 115 // beyond boundary — aerial
      trailType = 'six'
      label = '6'
    } else {
      distancePct = 22
      trailType = 'run'
    }

    // Convert angle + distance to field % coordinates
    // distancePct: 0–100 where 100 = boundary (≈75 m).
    const distMetres = (distancePct / 100) * MAX_DISTANCE
    const distPct = (distMetres / MAX_DISTANCE) * 43
    const visAngle = visualAngle(shotAngle, strikerHanded)
    const angleRad = (visAngle - 90) * (Math.PI / 180)
    const x = PITCH_CX + distPct * Math.cos(angleRad)
    const y = PITCH_CY + distPct * Math.sin(angleRad)

    // Compute trail line geometry (from pitch centre to ball landing spot)
    const lineLen = Math.hypot(x - PITCH_CX, y - PITCH_CY) * 1.4 // % width
    const lineAngle = Math.atan2(y - PITCH_CY, x - PITCH_CX) * (180 / Math.PI)

    // Two-step render: first frame sets width=0, second frame sets actual width
    // so the CSS transition fires from 0 → target.
    setTrail(null)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTrail({ x, y, type: trailType, label, key: Date.now(), lineLen, lineAngle, lineReady: false })
        requestAnimationFrame(() => {
          setTrail(prev => prev ? { ...prev, lineReady: true } : null)
        })
      })
    })

    // Auto-clear: 1.2s for most outcomes, 1.6s for boundaries
    const duration = (trailType === 'six' || trailType === 'four' || trailType === 'caught') ? 1600 : 1200
    trailTimerRef.current = setTimeout(() => setTrail(null), duration)

    return () => { if (trailTimerRef.current) clearTimeout(trailTimerRef.current) }
  }, [ballTrail])

  // Clear trail immediately when trailReset changes (next phase starts)
  useEffect(() => {
    if (trailReset > 0) {
      if (trailTimerRef.current) clearTimeout(trailTimerRef.current)
      setTrail(null)
    }
  }, [trailReset])

  const rosterOf = (posId) => fielderRoster[posId]
  const initialOf = (posId) => {
    const name = rosterOf(posId)?.name
    return name ? name[0].toUpperCase() : '·'
  }

  // Pointer → nearest named position.
  // Origin = pitch centre (PITCH_CX/PITCH_CY % of the field-view element).
  const nearestPosition = useCallback((clientX, clientY, fromPos) => {
    const rect = fieldRef.current?.getBoundingClientRect()
    if (!rect) return null
    const cx = rect.left + (PITCH_CX / 100) * rect.width
    const cy = rect.top + (PITCH_CY / 100) * rect.height
    const radius = Math.min(rect.width, rect.height) / 2 - 12

    let dx = clientX - cx
    let dy = clientY - cy
    const dist = Math.hypot(dx, dy)
    // Pointer angle in visual coordinates (matches visualAngle convention)
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90
    angle = ((angle % 360) + 360) % 360
    const distFrac = Math.max(0.10, Math.min(0.95, dist / radius))

    let best = null
    let bestScore = Infinity
    for (const pos of Object.values(FIELD_POSITIONS)) {
      if (pos.id === fromPos) continue
      const vis = visualAngle(pos.angle, strikerHanded)
      let d = Math.abs(vis - angle)
      d = d > 180 ? 360 - d : d
      const score = d + Math.abs(pos.distance - distFrac) * 160
      if (score < bestScore) {
        bestScore = score
        best = pos.id
      }
    }
    return best
  }, [strikerHanded])

  // ----- Drag -----
  const startDrag = useCallback((e, posId) => {
    if (!editable) return
    e.preventDefault()
    const rect = fieldRef.current.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const xPct = ((e.clientX - cx) / rect.width) * 100 + 50
    const yPct = ((e.clientY - cy) / rect.height) * 100 + 50
    dragRef.current = { fromPos: posId, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, active: false }
    if (e.currentTarget.setPointerCapture) {
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }, [editable])

  const moveDrag = useCallback((e) => {
    if (!dragRef.current) return
    const d = dragRef.current
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.active && Math.hypot(dx, dy) < 8) return // still a tap

    d.active = true
    const rect = fieldRef.current.getBoundingClientRect()
    const xPct = ((e.clientX - rect.left) / rect.width) * 100
    const yPct = ((e.clientY - rect.top) / rect.height) * 100
    setDragging({ fromPos: d.fromPos, xPct, yPct })
    setSnapTarget(nearestPosition(e.clientX, e.clientY, d.fromPos))
    setSelected(null)
  }, [nearestPosition])

  const endDrag = useCallback((e) => {
    if (!dragRef.current) return
    const d = dragRef.current
    const wasDrag = d.active
    dragRef.current = null
    setDragging(null)
    setSnapTarget(null)

    if (!wasDrag) {
      // Tap — select the fielder (captain only)
      setSelected(sel => (sel === d.fromPos ? null : d.fromPos))
      return
    }
    const target = nearestPosition(e.clientX, e.clientY, d.fromPos)
    if (target && editable) {
      onMoveFielder(d.fromPos, target)
    }
  }, [nearestPosition, editable, onMoveFielder])

  const positionPct = (posId) => {
    const pos = FIELD_POSITIONS[posId]
    return pos ? getPct(pos, isLeftHanded) : null
  }

  const presetName = FIELD_PRESETS[fieldPreset]?.name || 'Balanced'

  // Position picker (visible when a fielder is selected)
  const pickerList = Object.values(FIELD_POSITIONS)

  return (
    <div className="field-card">
      <div className="field-head">
        <span className="section-label">Fielding</span>
        <span className="field-preset-name">{presetName}</span>
      </div>

      {/* Presets — bowling captain only */}
      {editable && (
        <div className="field-presets hidden-scrollbar">
          {Object.entries(FIELD_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              className={`field-preset-btn ${fieldPreset === key ? 'active' : ''}`}
              onClick={() => onPresetChange(key)}
            >
              {preset.name}
            </button>
          ))}
        </div>
      )}

      <div className="field-stage">
        <div className={`field-view ${editable ? 'draggable' : ''} ${flash ? 'field-flash' : ''}`} ref={fieldRef}>
          <div className="field-pitch" />
          <div className="field-crease top" />
          <div className="field-crease bottom" />

          {/* Striker's bat — at the batting crease (top of pitch strip) */}
          <div
            className="striker-bat"
            style={{ left: '50%', top: '37%', transform: 'translate(-50%, -50%)' }}
          >🏏</div>

          {/* Wicket keeper — behind the batting stumps (above the bat) */}
          <div
            className="keeper-marker"
            style={{ left: '50%', top: '30%', transform: 'translate(-50%, -50%)' }}
          >🧤</div>

          {/* Bowling crease marker — where the bowler delivers from (below the bat) */}
          <div
            className="bowler-ball"
            style={{ left: '50%', top: '63%', transform: 'translate(-50%, -50%)' }}
          >⚾</div>

          {fielders.map((posId) => {
            const pct = positionPct(posId)
            if (!pct) return null
            const pos = FIELD_POSITIONS[posId]
            const isDraggingThis = dragging?.fromPos === posId
            if (isDraggingThis) return null // ghost replaces it
            return (
              <div
                key={posId}
                className={`fielder-dot ${pos.zone} ${selected === posId ? 'selected' : ''}`}
                style={{ left: `${pct.left}%`, top: `${pct.top}%` }}
                title={`${rosterOf(posId)?.name || 'Fielder'} — ${pos.name}`}
                onPointerDown={editable ? (e) => startDrag(e, posId) : undefined}
                onPointerMove={editable ? moveDrag : undefined}
                onPointerUp={editable ? endDrag : undefined}
                onPointerCancel={editable ? endDrag : undefined}
              >
                {initialOf(posId)}
              </div>
            )
          })}

          {/* Drag ghost */}
          {dragging && (
            <div
              className="drag-ghost"
              style={{ left: `${dragging.xPct}%`, top: `${dragging.yPct}%` }}
            >
              {initialOf(dragging.fromPos)}
            </div>
          )}

          {/* Snap target highlight */}
          {dragging && snapTarget && positionPct(snapTarget) && (
            <div
              className="snap-target"
              style={{ left: `${positionPct(snapTarget).left}%`, top: `${positionPct(snapTarget).top}%` }}
            />
          )}

          {/* Ball trail animation */}
          {trail && (
            <>
              {/* Trail line from pitch center to ball position */}
              {trail.type !== 'dot' && trail.type !== 'wicket-other' && (
                <div
                  className={`ball-trail-line ${trail.type}`}
                  style={{
                    left: '50%',
                    top: '50%',
                    width: trail.lineReady ? `${trail.lineLen}%` : '0%',
                    transform: `translate(0, -50%) rotate(${trail.lineAngle}deg)`,
                  }}
                />
              )}
              {/* Ball dot */}
              <div
                key={trail.key}
                className={`ball-trail ${trail.type}`}
                style={{ left: `${trail.x}%`, top: `${trail.y}%` }}
              >
                {trail.label && <span className="ball-trail-label">{trail.label}</span>}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Position picker — bowling captain after tapping a fielder */}
      {editable && selected && (
        <div className="position-picker hidden-scrollbar">
          {pickerList.map((pos) => {
            const occupiedBy = fielders.includes(pos.id)
            const isCurrent = pos.id === selected
            const occupant = occupiedBy ? initialOf(pos.id) : null
            return (
              <button
                key={pos.id}
                className={`pos-chip ${occupiedBy ? 'occupied' : ''} ${isCurrent ? 'current' : ''}`}
                onClick={() => {
                  if (pos.id !== selected) onMoveFielder(selected, pos.id)
                  setSelected(null)
                }}
              >
                {pos.name}
                {occupiedBy && <span className="pos-chip-initial">{occupant}</span>}
              </button>
            )
          })}
          <button
            className="pos-chip pos-done"
            onClick={() => setSelected(null)}
          >
            ✕ Done
          </button>
        </div>
      )}

      {/* Legend — position + fielder names */}
      {fielders.length > 0 && (
        <div className="field-legend">
          {fielders.map((posId) => {
            const pos = FIELD_POSITIONS[posId]
            if (!pos) return null
            const fielder = rosterOf(posId)
            return (
              <span key={posId} className="legend-chip">
                <span className={`dot ${pos.zone}`} />
                {pos.name}
                {fielder && <b className="legend-fielder">{fielder.name.split(' ')[0]}</b>}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
