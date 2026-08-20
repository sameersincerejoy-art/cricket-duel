import { useState } from 'react'

const OVER_OPTIONS = [
  { overs: 2, label: 'Quick' },
  { overs: 3, label: 'Short' },
  { overs: 4, label: 'T20' },
  { overs: 5, label: 'Blast' },
  { overs: 6, label: 'Six' },
  { overs: 8, label: 'Eight' },
  { overs: 10, label: 'Full' },
]

export default function Lobby({ socket, connected, onGameCreated }) {
  const [mode, setMode] = useState(null) // null, 'create', 'join'
  const [joinCode, setJoinCode] = useState('')
  const [totalOvers, setTotalOvers] = useState(2)
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)

  const handleCreate = () => {
    if (!socket || !connected || creating) return
    setCreating(true)

    socket.emit('create_game', { totalOvers }, (response) => {
      setCreating(false)
      if (response?.success) {
        onGameCreated(response)
      }
    })
  }

  const handleJoin = () => {
    if (!socket || !connected || !joinCode || joining) return
    setJoining(true)

    socket.emit('join_game', joinCode, (response) => {
      setJoining(false)
      if (response?.success) {
        onGameCreated(response)
      } else {
        alert(response?.error || 'Failed to join game')
      }
    })
  }

  return (
    <div className="lobby">
      <div className="logo-badge">🏏</div>
      <h1 className="lobby-title">Cricket Duel</h1>
      <p className="lobby-subtitle">
        Read the field. Outsmart the bowler. Choose the shot.
      </p>

      {!connected && (
        <div className="lobby-connect-note">Connecting to server…</div>
      )}

      {!mode && (
        <div className="lobby-actions">
          <button
            className="btn btn-primary btn-block"
            onClick={() => setMode('create')}
            disabled={!connected}
          >
            ⚡ Create Match
          </button>
          <button
            className="btn btn-secondary btn-block"
            onClick={() => setMode('join')}
            disabled={!connected}
          >
            🔗 Join Match
          </button>
        </div>
      )}

      {mode === 'create' && (
        <div className="lobby-card">
          <h2>Create Match</h2>

          <div className="form-group">
            <span className="form-label">Match Length</span>
            <div className="overs-grid">
              {OVER_OPTIONS.map((opt) => (
                <button
                  key={opt.overs}
                  className={`overs-chip ${totalOvers === opt.overs ? 'active' : ''}`}
                  onClick={() => setTotalOvers(opt.overs)}
                >
                  {opt.overs}
                  <small>{opt.label}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="btn-pair" style={{ marginTop: 4 }}>
            <button
              className="btn btn-secondary"
              onClick={() => setMode(null)}
            >
              Back
            </button>
            <button
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={!connected || creating}
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {mode === 'join' && (
        <div className="lobby-card">
          <h2>Join Match</h2>

          <div className="form-group">
            <span className="form-label">Match Code</span>
            <input
              className="field-input code-input"
              type="text"
              inputMode="numeric"
              placeholder="000000"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
            />
          </div>

          <div className="btn-pair">
            <button
              className="btn btn-secondary"
              onClick={() => setMode(null)}
            >
              Back
            </button>
            <button
              className="btn btn-primary"
              onClick={handleJoin}
              disabled={!connected || joining || joinCode.length < 6}
            >
              {joining ? 'Joining…' : 'Join'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
