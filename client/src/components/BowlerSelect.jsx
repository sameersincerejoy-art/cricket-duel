import { useState, useEffect } from 'react'

export default function BowlerSelect({ socket, gameState, matchState }) {
  const [bowlers, setBowlers] = useState([])
  const [maxOvers, setMaxOvers] = useState(1)
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!socket || !gameState?.matchCode) return

    socket.emit('get_bowling_options', gameState.matchCode, (response) => {
      if (response?.success) {
        setBowlers(response.bowlers)
        setMaxOvers(response.maxOvers)
      }
      setLoading(false)
    })
  }, [socket, gameState])

  const handleSelect = (bowler) => {
    if (bowler.exhausted) return
    setSelected(bowler.index)
  }

  const handleConfirm = () => {
    if (selected === null || !socket || !gameState?.matchCode) return
    socket.emit('select_bowler', gameState.matchCode, selected, (res) => {
      if (res && !res.success && res.error) alert(res.error)
    })
  }

  if (loading) {
    return (
      <div className="waiting-card">
        <div className="spinner" />
        <p className="waiting-main">Loading bowlers…</p>
      </div>
    )
  }

  return (
    <div>
      <div className="panel-header">
        <div className="panel-title">Select Bowler</div>
        <div className="panel-subtitle">Choose who bowls this over</div>
        <div className="panel-hint">
          ⚠️ BOWLER LIMIT: {maxOvers} OVER{maxOvers > 1 ? 'S' : ''}
        </div>
      </div>

      <div className="options-section">
        {bowlers.map((bowler) => (
          <div
            key={bowler.index}
            className={`option-card ${selected === bowler.index ? 'selected' : ''} ${bowler.exhausted ? 'exhausted' : ''}`}
            onClick={() => handleSelect(bowler)}
          >
            <div className="option-head">
              <span className="option-name">{bowler.name}</span>
              <span className="risk-badge risk-medium">{bowler.typeName || bowler.type}</span>
            </div>
            <div className="option-desc num">
              Overs: {bowler.oversBowled}/{bowler.maxOvers}
              {bowler.exhausted ? ' — limit reached' : ''}
            </div>
          </div>
        ))}
      </div>

      <div className="action-bar">
        <button
          className="btn btn-primary"
          onClick={handleConfirm}
          disabled={selected === null}
        >
          Confirm Bowler
        </button>
      </div>
    </div>
  )
}
