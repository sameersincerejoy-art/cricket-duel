import { useState, useEffect } from 'react'

function AttrBar({ label, value }) {
  return (
    <div className="attr-row">
      <span className="attr-label">{label}</span>
      <div className="attr-bar">
        <div className="attr-fill" style={{ width: `${value}%` }} />
      </div>
      <span className="attr-value num">{value}</span>
    </div>
  )
}

function PlayerAttrs({ player }) {
  const batting = player.batting
  const bowling = player.bowling
  const fielding = player.fielding

  return (
    <div className="player-attrs">
      {batting && (
        <div className="attr-group">
          <div className="attr-group-title">🏏 Batting</div>
          <AttrBar label="Timing" value={batting.timing} />
          <AttrBar label="Technique" value={batting.technique} />
          <AttrBar label="Power" value={batting.power} />
          <AttrBar label="Pace" value={batting.paceHandling} />
          <AttrBar label="Spin" value={batting.spinHandling} />
        </div>
      )}
      {bowling && (
        <div className="attr-group">
          <div className="attr-group-title">⚾ Bowling</div>
          <AttrBar label="Pace" value={bowling.pace} />
          <AttrBar label="Accuracy" value={bowling.accuracy} />
          <AttrBar label="Swing" value={bowling.swing} />
          <AttrBar label="Yorker" value={bowling.yorker} />
          <AttrBar label="Variation" value={bowling.variation} />
        </div>
      )}
      {fielding && (
        <div className="attr-group">
          <div className="attr-group-title">🧤 Fielding</div>
          <AttrBar label="Catching" value={fielding.catching} />
          <AttrBar label="Reflex" value={fielding.reflex} />
          <AttrBar label="Throwing" value={fielding.throwing} />
        </div>
      )}
    </div>
  )
}

function TeamCard({ team, isOwn, expanded, onToggle }) {
  if (!team) {
    return (
      <div className={`lobby-team-card lobby-team-empty ${isOwn ? 'lobby-own' : ''}`}>
        <div className="lobby-team-head">
          <span className="lobby-team-icon">⏳</span>
          <span className="lobby-team-name">Waiting for opponent…</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`lobby-team-card ${isOwn ? 'lobby-own' : ''}`}>
      <div className="lobby-team-head">
        <span className="lobby-team-icon">{isOwn ? '🟢' : '🔴'}</span>
        <div className="lobby-team-info">
          <span className="lobby-team-name">{team.name}</span>
          <span className="lobby-team-label">{isOwn ? 'Your Team' : 'Opponent'}</span>
        </div>
      </div>
      <ul className="lobby-player-list">
        {(team.players || []).map((player, i) => (
          <li
            key={i}
            className={`lobby-player ${expanded === i ? 'expanded' : ''}`}
            onClick={() => onToggle(isOwn ? `own_${i}` : `opp_${i}`)}
          >
            <span className="lobby-p-num num">{i + 1}</span>
            <span className="lobby-p-name">{player.name}</span>
            <span className="lobby-p-role">{player.roleName || player.role}</span>
            {player.canBowl && <span className="lobby-p-tag">⚾</span>}
            <span className="lobby-p-chevron">{expanded === (isOwn ? `own_${i}` : `opp_${i}`) ? '▲' : '▼'}</span>
            {expanded === (isOwn ? `own_${i}` : `opp_${i}`) && <PlayerAttrs player={player} />}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function MatchLobby({ socket, gameState, onStartToss }) {
  const [opponentJoined, setOpponentJoined] = useState(false)
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(null)

  // teams[0] = host team, teams[1] = guest team
  const teams = gameState?.teams || (gameState?.team ? [gameState.team, null] : [null, null])
  const myTeamIndex = gameState?.teamIndex ?? 0
  const myTeam = teams[myTeamIndex]
  const oppTeam = teams[myTeamIndex === 0 ? 1 : 0]

  useEffect(() => {
    if (oppTeam) setOpponentJoined(true)
  }, [oppTeam])

  useEffect(() => {
    if (gameState?.teams?.[1]) setOpponentJoined(true)
  }, [gameState])

  useEffect(() => {
    if (!socket) return
    const handlePlayerJoined = (data) => {
      setOpponentJoined(true)
    }
    socket.on('player_joined', handlePlayerJoined)
    return () => socket.off('player_joined', handlePlayerJoined)
  }, [socket])

  const handleCopyCode = () => {
    if (gameState?.matchCode) {
      navigator.clipboard?.writeText(gameState.matchCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="match-lobby">
      {/* Match code card */}
      <div className="match-code-card" onClick={handleCopyCode} style={{ cursor: 'pointer' }}>
        <div className="match-code-label">Match Code · Tap to copy</div>
        <div className="match-code num">{gameState?.matchCode || '------'}</div>
        <div className={`match-code-status ${opponentJoined ? 'ready' : 'waiting'}`}>
          <span className="status-dot" />
          {opponentJoined
            ? 'Both teams ready — start the toss!'
            : copied ? '✅ Code copied — share it!' : 'Waiting for opponent…'}
        </div>
      </div>

      {/* Both teams side by side */}
      <div className="lobby-teams-grid">
        <TeamCard
          team={myTeam}
          isOwn={true}
          expanded={expanded}
          onToggle={setExpanded}
        />
        <div className="lobby-vs">VS</div>
        <TeamCard
          team={oppTeam}
          isOwn={false}
          expanded={expanded}
          onToggle={setExpanded}
        />
      </div>

      {/* Start toss button */}
      {opponentJoined && gameState?.matchCode && (
        <div style={{ marginTop: 16, width: '100%', maxWidth: 400 }}>
          <button className="btn btn-primary btn-block" onClick={onStartToss}>
            🪙 Start Toss
          </button>
        </div>
      )}
    </div>
  )
}
