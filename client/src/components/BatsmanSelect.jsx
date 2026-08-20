import { useState, useEffect } from 'react'

export default function BatsmanSelect({ socket, gameState, matchState }) {
  const [batsmen, setBatsmen] = useState([])
  const [strikerIdx, setStrikerIdx] = useState(null)
  const [nonStrikerIdx, setNonStrikerIdx] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!socket || !gameState?.matchCode) return

    socket.emit('get_batting_options', gameState.matchCode, (response) => {
      if (response?.success) {
        setBatsmen(response.batsmen)
      }
      setLoading(false)
    })
  }, [socket, gameState])

  const handleSelect = (batsman) => {
    if (batsman.out) return

    if (strikerIdx === null) {
      // First pick = striker
      setStrikerIdx(batsman.index)
      setNonStrikerIdx(null)
    } else if (nonStrikerIdx === null && batsman.index !== strikerIdx) {
      // Second pick = non-striker
      setNonStrikerIdx(batsman.index)
    } else {
      // Swap striker
      if (batsman.index === strikerIdx) {
        // Deselect striker
        setStrikerIdx(nonStrikerIdx)
        setNonStrikerIdx(null)
      } else if (batsman.index === nonStrikerIdx) {
        // Deselect non-striker
        setNonStrikerIdx(null)
      } else {
        // Replace striker
        setStrikerIdx(batsman.index)
      }
    }
  }

  const handleConfirm = () => {
    if (strikerIdx === null || nonStrikerIdx === null || !socket || !gameState?.matchCode) return
    socket.emit('select_opening_batsmen', gameState.matchCode, strikerIdx, nonStrikerIdx, (res) => {
      if (res && !res.success && res.error) alert(res.error)
    })
  }

  if (loading) {
    return (
      <div className="waiting-card">
        <div className="spinner" />
        <p className="waiting-main">Loading batting order…</p>
      </div>
    )
  }

  const bothSelected = strikerIdx !== null && nonStrikerIdx !== null

  return (
    <div>
      <div className="panel-header">
        <div className="panel-title">🏏 Choose Opening Batsmen</div>
        <div className="panel-subtitle">
          {bothSelected
            ? <span>Striker: <b>{batsmen.find(b => b.index === strikerIdx)?.name}</b> · Non-striker: <b>{batsmen.find(b => b.index === nonStrikerIdx)?.name}</b></span>
            : strikerIdx !== null
              ? <span>Striker: <b>{batsmen.find(b => b.index === strikerIdx)?.name}</b> — now pick the non-striker</span>
              : 'Pick who takes strike first, then the non-striker'
          }
        </div>
        <div className="panel-hint">
          {strikerIdx === null
            ? '👆 Tap a batsman to open the batting'
            : nonStrikerIdx === null
              ? '👆 Tap another batsman as the non-striker'
              : '✅ Ready — or tap a different opener to change'
          }
        </div>
      </div>

      <div className="options-section">
        {batsmen.map((batsman) => {
          const isStriker = strikerIdx === batsman.index
          const isNonStriker = nonStrikerIdx === batsman.index
          const selected = isStriker || isNonStriker

          return (
            <div
              key={batsman.index}
              className={`option-card ${selected ? 'selected' : ''} ${batsman.out ? 'exhausted' : ''}`}
              onClick={() => handleSelect(batsman)}
            >
              <div className="option-head">
                <span className="option-name">
                  {isStriker && <span className="option-emoji">⚡</span>}
                  {isNonStriker && <span className="option-emoji">🏃</span>}
                  {batsman.name}
                </span>
                <span className={`risk-badge ${isStriker ? 'risk-safe' : isNonStriker ? 'risk-medium' : 'risk-risky'}`}>
                  {isStriker ? 'Striker' : isNonStriker ? 'Non-Striker' : batsman.hand || ''}
                </span>
              </div>
              <div className="option-desc">
                {batsman.role} · {batsman.hand || 'R-handed'}
              </div>
            </div>
          )
        })}
      </div>

      <div className="action-bar">
        <button
          className="btn btn-primary"
          onClick={handleConfirm}
          disabled={!bothSelected}
        >
          {bothSelected ? '✅ Confirm Opening Pair' : `Pick ${strikerIdx === null ? 'striker' : 'non-striker'}`}
        </button>
      </div>
    </div>
  )
}
