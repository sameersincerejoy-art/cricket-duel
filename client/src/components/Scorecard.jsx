import { useState } from 'react'

export default function Scorecard({ matchState, onPlayAgain }) {
  const [expandedBall, setExpandedBall] = useState(null)
  const scorecard = matchState?.completedData?.scorecard || matchState?.scorecard
  const result = matchState?.completedData?.result || matchState?.result
  const timeline = matchState?.completedData?.timeline || matchState?.timeline

  if (!scorecard) {
    return (
      <div className="scorecard">
        <div className="scorecard-team" style={{ padding: 40, textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 14px' }} />
          <p style={{ color: 'var(--text-2)' }}>Loading scorecard…</p>
        </div>
        <button className="btn btn-primary btn-block" onClick={onPlayAgain}>
          🏏 Play Again
        </button>
      </div>
    )
  }

  const team1 = scorecard.team1
  const team2 = scorecard.team2

  const getResultText = () => {
    if (!result || result.type === 'tie') return 'Match Tied!'
    const winnerName = result.winner === 0 ? team1.name : team2.name
    return result.type === 'runs'
      ? `${winnerName} won by ${result.margin} runs!`
      : `${winnerName} won by ${result.margin} wickets!`
  }

  const TeamCard = ({ team }) => (
    <div className="scorecard-team">
      <div className="scorecard-team-head">
        <div className="team-name">{team.name}</div>
        <div className="team-total num">
          {team.score}/{team.wickets}
          <small> · {team.overs} ov</small>
        </div>
      </div>

      <div className="table-label">Batting</div>
      <div className="scorecard-table-wrap">
        <table className="scorecard-table">
          <thead>
            <tr>
              <th>Batter</th>
              <th>R</th>
              <th>B</th>
              <th>4s</th>
              <th>6s</th>
              <th>SR</th>
            </tr>
          </thead>
          <tbody>
            {team.batsman?.map((b, i) => (
              <tr key={i}>
                <td>
                  <span className={`batter-name ${b.out ? 'out' : ''}`}>{b.name}</span>
                  {b.out && (
                    <span className="dismissal"> {b.dismissal || 'out'}</span>
                  )}
                </td>
                <td className="strong">{b.runs}</td>
                <td>{b.balls}</td>
                <td>{b.fours}</td>
                <td>{b.sixes}</td>
                <td>{b.sr}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {team.bowlers?.length > 0 && (
        <>
          <div className="table-label">Bowling</div>
          <div className="scorecard-table-wrap">
            <table className="scorecard-table">
              <thead>
                <tr>
                  <th>Bowler</th>
                  <th>O</th>
                  <th>R</th>
                  <th>W</th>
                  <th>Econ</th>
                </tr>
              </thead>
              <tbody>
                {team.bowlers?.map((b, i) => (
                  <tr key={i}>
                    <td className="batter-name">{b.name}</td>
                    <td>{b.overs}</td>
                    <td>{b.runs}</td>
                    <td className="strong">{b.wickets}</td>
                    <td>{b.economy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )

  return (
    <div className="scorecard">
      {/* Result hero */}
      <div className="result-hero-card">
        <div className="trophy">🏆</div>
        <h1>Match Complete</h1>
        <div className="result-text">{getResultText()}</div>
        <div className="result-sub">
          {team1.name} {team1.score}/{team1.wickets} · {team2.name} {team2.score}/{team2.wickets}
        </div>
      </div>

      <TeamCard team={team1} />
      <TeamCard team={team2} />

      {/* Ball-by-ball timeline (design doc point 50) */}
      {timeline?.length > 0 && (
        <div className="scorecard-team">
          <div className="scorecard-team-head">
            <div className="team-name">📜 Ball-by-Ball</div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-3)', padding: '10px 16px 0' }}>
            Tap any ball to see the delivery, the shot and how it happened
          </p>
          <div className="timeline-list">
            {timeline.map((ball, i) => {
              const o = ball.outcome
              const glyph = o.isWide ? 'Wd' : o.isNoBall ? 'Nb' : o.wicket ? 'W' : o.runs === 0 ? '•' : o.runs
              const cls = o.wicket ? 'wicket' : o.isWide || o.isNoBall ? 'extra' : o.runs === 4 ? 'four' : o.runs === 6 ? 'six' : o.runs === 0 ? 'dot' : 'run'
              const open = expandedBall === i
              return (
                <div
                  key={i}
                  className={`timeline-ball ${open ? 'open' : ''}`}
                  onClick={() => setExpandedBall(open ? null : i)}
                >
                  <span className="timeline-label num">
                    {ball.innings === 2 ? '2' : '1'}.{ball.over + 1}.{ball.ball + 1}
                  </span>
                  <span className={`timeline-glyph ${cls}`}>{glyph}</span>
                  <span className="timeline-score num">{ball.score}/{ball.wickets}</span>
                  <span className="timeline-chevron">{open ? '▲' : '▼'}</span>

                  {open && (
                    <div className="timeline-detail">
                      <p>🎯 Delivery: <b>{ball.delivery.type}</b> on <b>{ball.delivery.line}</b></p>
                      <p>🏏 Shot: <b>{ball.shot.type}</b> at <b>{ball.shot.power}%</b></p>
                      <p style={{ color: o.wicket ? 'var(--red)' : 'var(--text)' }}>
                        {o.description}
                      </p>
                      {o.extraRuns > 0 && (
                        <p>+ {o.extraRuns} extra</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="action-bar">
        <button className="btn btn-primary" onClick={onPlayAgain}>
          🏏 Play Again
        </button>
      </div>
    </div>
  )
}
