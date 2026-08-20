import { useState, useEffect } from 'react'

export default function BowlingPanel({ socket, gameState, data, totalBallsBowled = 0 }) {
  // Show risk badges only for the first 3 balls as a learning aid
  const showRisk = totalBallsBowled <= 3
  const [selected, setSelected] = useState(null)
  const [timeLeft, setTimeLeft] = useState(data.timerSeconds || 15)

  useEffect(() => {
    setTimeLeft(data.timerSeconds || 15)
  }, [data.timerSeconds])

  useEffect(() => {
    if (timeLeft <= 0) return
    const interval = setInterval(() => setTimeLeft(t => t - 1), 1000)
    return () => clearInterval(interval)
  }, [timeLeft > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = (option) => {
    setSelected(option)
  }

  const handleConfirm = () => {
    if (!selected || !socket || !gameState?.matchCode) return
    socket.emit('choose_delivery', gameState.matchCode, selected, () => {})
  }

  return (
    <div>
      <div className="panel-header">
        <div className="panel-title">⚾ Bowl to {data.batsman?.name || 'Batsman'}</div>
        <div className="panel-subtitle">
          {data.bowler?.name} — <b>{data.bowlerTypeName || data.bowler?.typeName || data.bowler?.type}</b>
        </div>
        <div className="panel-hint" style={{ marginBottom: 0 }}>
          🎯 Pick the delivery <b>type</b> and the <b>line</b> — these are all you can bowl as {data.bowlerTypeName || 'this bowler type'}
        </div>
      </div>

      {/* Batsman's recent shots — read their tendencies (design doc point 40) */}
      {data.batsmanMemory?.length > 0 && (
        <div className="memory-box">
          <div className="memory-title">
            {data.batsman?.name}'s last {data.batsmanMemory.length} balls
          </div>
          <div className="memory-chips">
            {data.batsmanMemory.map((m, i) => (
              <span key={i} className="memory-chip">
                <b>{m.shot}</b>
                <span className="chip-result">
                  {m.power}%{m.wicket ? ' · W' : m.result > 0 ? ` · ${m.result}` : ''}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="timer-row">
        <div className="panel-hint" style={{ marginBottom: 0 }}>
          🤫 Batsman can't see this
        </div>
        <div className={`timer-pill ${timeLeft <= 5 ? 'low' : ''}`}>
          ⏱ {timeLeft}s
        </div>
      </div>

      <div className="options-section">
        {data.options?.map((option, i) => (
          <div
            key={i}
            className={`option-card ${selected === option ? 'selected' : ''}`}
            onClick={() => handleSelect(option)}
          >
            <div className="option-head">
              <span className="option-name">{option.label}</span>
              {option.risky && showRisk && <span className="risk-badge risk-risky">Risky</span>}
            </div>
            <div className="option-desc">
              {option.risky
                ? '⚠ High-risk variation — read it wrong and it goes to the boundary'
                : 'Line: ' + (option.line?.replace(/_/g, ' ') || '—')}
            </div>
          </div>
        ))}
      </div>

      <div className="action-bar">
        <button
          className="btn btn-primary"
          onClick={handleConfirm}
          disabled={!selected || timeLeft <= 0}
        >
          {timeLeft <= 0 ? '⏳ Auto-picking…' : '🎯 Bowl!'}
        </button>
      </div>
    </div>
  )
}
