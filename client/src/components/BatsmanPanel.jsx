import { useState, useEffect } from 'react'

export default function BatsmanPanel({ socket, gameState, data, totalBallsBowled = 0 }) {
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
    socket.emit('choose_shot', gameState.matchCode, selected, () => {})
  }

  const getRiskLevel = (power) => {
    if (power <= 40) return { label: 'Safe', cls: 'risk-safe' }
    if (power <= 70) return { label: 'Balanced', cls: 'risk-medium' }
    return { label: 'High Risk', cls: 'risk-risky' }
  }

  const getShotEmoji = (label) => {
    const l = label.toLowerCase()
    if (l.includes('defence') || l.includes('leave')) return '🛡️'
    if (l.includes('lofted') || l.includes('hook') || l.includes('reverse') || l.includes('sweep')) return '💥'
    return '🏏'
  }

  const ms = data.matchState

  return (
    <div>
      <div className="panel-header">
        <div className="panel-title">🏏 Your Shot, {data.batsman?.name || 'Batsman'}</div>
        <div className="panel-subtitle">
          vs <b>{data.bowlerName}</b> — {data.bowlerTypeName || data.bowlerType} · read the field
        </div>
        <div className="panel-hint" style={{ marginBottom: 0 }}>
          🎭 You know the bowler type, not the delivery. Back your read — one of these three is the right shot
        </div>
      </div>

      {/* Match context */}
      {ms && (
        <div className="info-grid">
          <div className="info-cell">
            <div className="info-label">Score</div>
            <div className="info-value num">{ms.score}/{ms.wickets}</div>
          </div>
          <div className="info-cell">
            <div className="info-label">Over</div>
            <div className="info-value num">{ms.over}.{ms.ball}</div>
          </div>
          {ms.target ? (
            <div className="info-cell">
              <div className="info-label">Need</div>
              <div className="info-value num hot">
                {ms.target - ms.score} <small style={{ fontSize: 10, color: 'var(--text-3)' }}>({((ms.totalOvers - ms.over) * 6 - ms.ball)}b)</small>
              </div>
            </div>
          ) : (
            <div className="info-cell">
              <div className="info-label">Overs</div>
              <div className="info-value num">{ms.totalOvers}</div>
            </div>
          )}
        </div>
      )}

      {/* This over's balls */}
      {data.ballHistory?.length > 0 && (
        <div className="balls-strip hidden-scrollbar">
          {data.ballHistory.map((b, i) => (
            <div
              key={i}
              className={`ball-dot ${
                b.wicket ? 'wicket' :
                b.result === 4 ? 'four' :
                b.result === 6 ? 'six' :
                b.result === 0 ? 'dot' :
                b.isWide || b.isNoBall ? 'extra' : 'run'
              }`}
            >
              {b.wicket ? 'W' :
               b.isWide ? 'Wd' :
               b.isNoBall ? 'Nb' :
               b.result === 0 ? '•' : b.result}
            </div>
          ))}
        </div>
      )}

      {/* Bowler's recent deliveries — read the pattern (design doc point 41) */}
      {data.bowlerMemory?.length > 0 && (
        <div className="memory-box">
          <div className="memory-title">
            {data.bowlerName}'s last {data.bowlerMemory.length} balls
          </div>
          <div className="memory-chips">
            {data.bowlerMemory.map((m, i) => (
              <span key={i} className="memory-chip">
                <b>{m.type}</b>
                <span className="chip-result">
                  {m.line}{m.wicket ? ' · W' : m.result > 0 ? ` · ${m.result}` : ''}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="timer-row">
        <div className="panel-hint" style={{ marginBottom: 0 }}>
          🎭 You can't see the delivery!
        </div>
        <div className={`timer-pill ${timeLeft <= 5 ? 'low' : ''}`}>
          ⏱ {timeLeft}s
        </div>
      </div>

      <div className="options-section">
        {data.options?.map((option, i) => {
          const risk = getRiskLevel(option.power)
          return (
            <div
              key={i}
              className={`option-card ${selected === option ? 'selected' : ''}`}
              onClick={() => handleSelect(option)}
            >
              <div className="option-head">
                <span className="option-name">
                  <span className="option-emoji">{getShotEmoji(option.label)}</span>
                  {option.label}
                </span>
                {showRisk && <span className={`risk-badge ${risk.cls}`}>{risk.label}</span>}
              </div>
              <div className="option-desc">
                Power: <b className="num">{option.power}%</b>
              </div>
            </div>
          )
        })}
      </div>

      <div className="action-bar">
        <button
          className="btn btn-primary"
          onClick={handleConfirm}
          disabled={!selected || timeLeft <= 0}
        >
          {timeLeft <= 0 ? '⏳ Auto-picking…' : '🏏 Play Shot!'}
        </button>
      </div>
    </div>
  )
}
