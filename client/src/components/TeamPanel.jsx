export default function TeamPanel({ matchState, onClose }) {
  if (!matchState) return null

  const yourTeam = matchState.yourTeam
  const isBatting = matchState.yourTeamIndex === matchState.battingTeamIndex
  const battingTeamName = matchState.battingTeam || 'Batting'
  const bowlingTeamName = matchState.bowlingTeam || 'Bowling'
  const score = matchState.score || 0
  const wickets = matchState.wickets || 0
  const over = matchState.currentOver || 0
  const ball = matchState.currentBall || 0
  const target = matchState.target
  const otherTeamScore = target ? target - 1 : null
  const batsmanScores = matchState.batsmanScores || []
  const bowlerFigures = matchState.bowlerFigures || []

  return (
    <div className="tp-overlay" onClick={onClose}>
      <div className="tp-modal" onClick={e => e.stopPropagation()}>
        <button className="tp-close" onClick={onClose}>✕</button>

        {/* Header */}
        <div className="tp-modal-head">
          <div className="tp-modal-team">{yourTeam?.name || 'Your Team'}</div>
          <div className="tp-modal-role" data-role={isBatting ? 'batting' : 'bowling'}>
            {isBatting ? '🏏 Batting' : '⚾ Bowling'}
          </div>
        </div>

        {/* Score */}
        <div className="tp-modal-score">
          <div className="tp-ms-row">
            <span className="tp-ms-name">{battingTeamName}</span>
            <span className="tp-ms-runs num">{score}/{wickets}</span>
            <span className="tp-ms-ov num">{over}.{ball} ov</span>
          </div>
          {target && (
            <>
              <div className="tp-ms-row tp-ms-dim">
                <span className="tp-ms-name">{bowlingTeamName}</span>
                <span className="tp-ms-runs num">{otherTeamScore}</span>
                <span className="tp-ms-ov">1st inns</span>
              </div>
              <div className="tp-ms-need">
                Need <b className="num">{Math.max(0, target - score)}</b> from{' '}
                <b className="num">{Math.max(0, matchState.totalOvers * 6 - (over * 6 + ball))}</b> balls
              </div>
            </>
          )}
        </div>

        {/* Batting card */}
        {batsmanScores.length > 0 && (
          <div className="tp-modal-section">
            <div className="tp-modal-stitle">🏏 {battingTeamName} — Batting</div>
            <table className="tp-modal-table">
              <thead>
                <tr><th>Batter</th><th className="num">R</th><th className="num">B</th><th className="num">4s</th><th className="num">6s</th><th>SR</th></tr>
              </thead>
              <tbody>
                {batsmanScores.map((b, i) => (
                  <tr key={i} className={b.out ? 'tp-out' : ''}>
                    <td className="tp-mt-name">
                      {b.out && <span className="tp-dot-w">●</span>}
                      {!b.out && i === batsmanScores.length - 1 && <span className="tp-dot-s">●</span>}
                      {b.name}
                    </td>
                    <td className="num">{b.runs}</td>
                    <td className="num">{b.balls}</td>
                    <td className="num">{b.fours || 0}</td>
                    <td className="num">{b.sixes || 0}</td>
                    <td className="num">{b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(1) : '0.0'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Bowling card */}
        {bowlerFigures.length > 0 && (
          <div className="tp-modal-section">
            <div className="tp-modal-stitle">⚾ {bowlingTeamName} — Bowling</div>
            <table className="tp-modal-table">
              <thead>
                <tr><th>Bowler</th><th>O</th><th className="num">R</th><th className="num">W</th><th className="num">WD</th><th className="num">NB</th><th>ER</th></tr>
              </thead>
              <tbody>
                {bowlerFigures.map((b, i) => (
                  <tr key={i}>
                    <td className="tp-mt-name">{b.name}</td>
                    <td>{b.overs}</td>
                    <td className="num">{b.runs}</td>
                    <td className="num">{b.wickets}</td>
                    <td className="num">{b.wides || 0}</td>
                    <td className="num">{b.noBalls || 0}</td>
                    <td className="num">{b.overs > 0 ? (b.runs / b.overs).toFixed(1) : '0.0'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Squad */}
        {yourTeam && yourTeam.players && (
          <div className="tp-modal-section">
            <div className="tp-modal-stitle">👥 {yourTeam.name} — Squad</div>
            <div className="tp-modal-squad">
              {yourTeam.players.map((p, i) => (
                <div key={i} className="tp-ms-row tp-ms-player">
                  <span className="tp-ms-pname">{p.name}</span>
                  <span className="tp-ms-prole">{p.roleName || p.role}</span>
                  {p.handed === 'left' && <span className="tp-ms-hand">LH</span>}
                  {p.canBowl && <span className="tp-ms-tag tp-ms-bowl"> bowl</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
