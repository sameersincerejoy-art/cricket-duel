import { useState, useEffect, useCallback } from 'react'
import FieldView from './FieldView'
import BowlingPanel from './BowlingPanel'
import BatsmanPanel from './BatsmanPanel'
import BallResult from './BallResult'
import BowlerSelect from './BowlerSelect'
import BatsmanSelect from './BatsmanSelect'
import TeamPanel from './TeamPanel'

export default function Match({ socket, gameState, matchState }) {
  const [localPhase, setLocalPhase] = useState('bowler_select')
  const [showTeam, setShowTeam] = useState(false)
  const [trailReset, setTrailReset] = useState(0)

  useEffect(() => {
    if (!matchState) return

    // Clear ball trail when we leave the result phase
    if (localPhase === 'result' && matchState.phase !== 'result') {
      setTrailReset(n => n + 1)
    }

    switch (matchState.phase) {
      case 'bowler_choose':
        setLocalPhase('bowler_choose')
        break
      case 'batsman_choose':
        setLocalPhase('batsman_choose')
        break
      case 'waiting':
        setLocalPhase('waiting')
        break
      case 'result':
        setLocalPhase('result')
        break
      case 'new_over':
        setLocalPhase('bowler_select')
        break
      case 'batsman_select':
        setLocalPhase('batsman_select')
        break
      case 'innings_break':
        setLocalPhase('innings_break')
        break
      case 'completed':
        setLocalPhase('completed')
        break
      default:
        if (matchState.currentOver === 0 && matchState.ballHistory?.length === 0) {
          setLocalPhase('bowler_select')
        } else {
          setLocalPhase('bowler_select')
        }
    }
  }, [matchState?.phase])

  const handleFieldChange = useCallback((preset) => {
    if (socket && gameState?.matchCode) {
      socket.emit('change_field', gameState.matchCode, preset, (res) => {
        if (res && !res.success && res.error) alert(res.error)
      })
    }
  }, [socket, gameState])

  // Manual field editing — drag a fielder or tap-to-pick a position
  const handleMoveFielder = useCallback((fromPos, toPos) => {
    if (socket && gameState?.matchCode) {
      socket.emit('move_fielder', gameState.matchCode, fromPos, toPos, (res) => {
        if (res && !res.success && res.error) alert(res.error)
      })
    }
  }, [socket, gameState])

  if (!matchState) {
    return (
      <div className="match-screen">
        <div className="match-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spinner" />
        </div>
      </div>
    )
  }

  const battingTeam = matchState.battingTeam || 'Batting Team'
  const bowlingTeam = matchState.bowlingTeam || 'Bowling Team'
  const score = matchState.score || 0
  const wickets = matchState.wickets || 0
  const over = matchState.currentOver || 0
  const ball = matchState.currentBall || 0
  const totalOvers = matchState.totalOvers || 2
  const totalBallsBowled = over * 6 + ball

  const isBattingTeam =
    matchState.battingTeamIndex !== undefined &&
    matchState.yourTeamIndex === matchState.battingTeamIndex

  // Batting pair: last two not-out batters from the live scorecard
  const notOut = (matchState.batsmanScores || []).filter(b => !b.out)
  const striker = notOut[notOut.length - 1]
  const nonStriker = notOut[notOut.length - 2]

  // Current bowler figures
  const bowlerFigures = (matchState.bowlerFigures || []).find(
    b => matchState.currentBowler && b.name === matchState.currentBowler.name
  )
  const bowlerFigureText = bowlerFigures
    ? `${bowlerFigures.overs}-${bowlerFigures.runs}-${bowlerFigures.wickets}`
    : null

  // Fielding team's score (2nd innings = their 1st-innings total)
  const fieldingScore = matchState.target
    ? String(matchState.target - 1)
    : '—'

  const WaitingCard = ({ message }) => (
    <div className="waiting-card">
      <div className="spinner" />
      <p className="waiting-main">{message}</p>
      <p className="waiting-sub">
        {isBattingTeam ? battingTeam : bowlingTeam} is {isBattingTeam ? 'batting' : 'bowling'}
      </p>
    </div>
  )

  const renderPhase = () => {
    switch (localPhase) {
      case 'batsman_select':
        return isBattingTeam
          ? (
            <BatsmanSelect
              socket={socket}
              gameState={gameState}
              matchState={matchState}
            />
          )
          : <WaitingCard message="Waiting for the batting captain to choose opening batsmen…" />

      case 'bowler_select':
        return isBattingTeam
          ? <WaitingCard message="Waiting for the captain to choose a bowler…" />
          : (
            <BowlerSelect
              socket={socket}
              gameState={gameState}
              matchState={matchState}
            />
          )

      case 'bowler_choose':
        return matchState.bowlerData
          ? isBattingTeam
            ? <WaitingCard message="Bowler is choosing a delivery…" />
            : (
              <BowlingPanel
                socket={socket}
                gameState={gameState}
                data={matchState.bowlerData}
                totalBallsBowled={totalBallsBowled}
              />
            )
          : <WaitingCard message="Waiting for the bowler…" />

      case 'batsman_choose':
        return matchState.batsmanData
          ? !isBattingTeam
            ? <WaitingCard message="Batsman is choosing a shot…" />
            : (
              <BatsmanPanel
                socket={socket}
                gameState={gameState}
                totalBallsBowled={totalBallsBowled}
                data={matchState.batsmanData}
              />
            )
          : <WaitingCard message="Waiting for the batsman…" />

      case 'waiting':
        return <WaitingCard message={matchState.waitingMessage || 'Waiting for opponent…'} />

      case 'result':
        return matchState.lastResult
          ? <BallResult result={matchState.lastResult} />
          : <WaitingCard message="Waiting for the result…" />

      case 'innings_break':
        return matchState.inningsBreakData && (
          <div className="innings-break">
            <h1>Innings Break!</h1>
            <p>{matchState.inningsBreakData.battingTeam} needs</p>
            <div className="target-num num">{matchState.inningsBreakData.target}</div>
            <p>to win · {totalOvers * 6} balls</p>
          </div>
        )

      case 'completed':
        return <WaitingCard message="Match complete — loading result…" />

      default:
        return <WaitingCard message="Preparing the next ball…" />
    }
  }

  return (
    <div className="match-screen">
      <div className="match-layout">
        {/* === LEFT COLUMN — Field view + Score === */}
        <div className="match-left">
          {/* Score header */}
          <div className="score-header">
            <div className="score-grid">
              <div className="team-block batting">
                <div className="team-name">{battingTeam}</div>
                <div className="score-runs num">{score}/{wickets}</div>
                <div className="score-detail num">{over}.{ball} ov</div>
              </div>

              <div className="center-chip">
                <div className="chip-label">
                  {matchState.target ? 'Target' : `Innings ${matchState.currentInnings || 1}`}
                </div>
                <div className="chip-value num">
                  {matchState.target
                    ? `${matchState.target} · ${Math.max(0, matchState.target - score)} need`
                    : 'of 2'}
                </div>
              </div>

              <div className="team-block">
                <div className="team-name">{bowlingTeam}</div>
                <div className="score-runs num">{fieldingScore}</div>
                <div className="score-detail">{matchState.target ? '1st inns' : 'to bat'}</div>
              </div>
            </div>
          </div>

          {/* Ball history strip */}
          <div className="over-balls hidden-scrollbar">
            {(matchState.ballHistory || []).slice(-12).map((ball, i) => (
              <div
                key={i}
                className={`ball-dot ${
                  ball.wicket ? 'wicket' :
                  ball.result === 4 ? 'four' :
                  ball.result === 6 ? 'six' :
                  ball.result === 0 ? 'dot' :
                  ball.isWide || ball.isNoBall ? 'extra' :
                  'run'
                }`}
              >
                {ball.wicket ? 'W' :
                 ball.isWide ? 'Wd' :
                 ball.isNoBall ? 'Nb' :
                 ball.result === 0 ? '•' :
                 ball.result}
              </div>
            ))}
            {(!matchState.ballHistory || matchState.ballHistory.length === 0) && (
              <div className="ball-dot empty">•</div>
            )}
          </div>

          {/* Field view — always visible on the left */}
          <div className="match-left-scroll">
            <FieldView
              fielders={matchState.fielders || []}
              fieldPreset={matchState.fieldPreset || 'balanced'}
              fielderRoster={matchState.fielderRoster || {}}
              onPresetChange={isBattingTeam ? null : handleFieldChange}
              onMoveFielder={isBattingTeam ? null : handleMoveFielder}
              flashKey={isBattingTeam ? matchState.fieldFlashKey : null}
              strikerHanded={matchState.strikerHanded || 'right'}
              ballTrail={matchState.lastResult?.trail || null}
              trailReset={trailReset}
            />

            {/* Confidence + pressure */}
            <div className="confidence-row">
              <div className="conf-bar">
                <div className="conf-head">
                  <span className="conf-label">Bat</span>
                  <span className="conf-value num" style={{ color: 'var(--green)' }}>
                    {matchState.confidence?.batsman || 70}
                  </span>
                </div>
                <div className="bar">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${matchState.confidence?.batsman || 70}%`,
                      background: 'linear-gradient(90deg, #1e7d4d, #3ddc84)',
                    }}
                  />
                </div>
              </div>
              <div className="conf-bar">
                <div className="conf-head">
                  <span className="conf-label">Bowl</span>
                  <span className="conf-value" style={{ color: 'var(--blue)' }}>
                    {matchState.confidence?.bowler || 70}
                  </span>
                </div>
                <div className="bar">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${matchState.confidence?.bowler || 70}%`,
                      background: 'linear-gradient(90deg, #2a5ca8, #5aa2ff)',
                    }}
                  />
                </div>
              </div>
              {matchState.pressure > 0 && (
                <div className={`pressure-chip ${
                  matchState.pressure > 60 ? 'pressure-high' :
                  matchState.pressure > 30 ? 'pressure-medium' :
                  'pressure-low'
                }`}>
                  {matchState.pressure > 60 ? '🔴' :
                   matchState.pressure > 30 ? '🟡' : '🟢'}
                  {matchState.pressure > 60 ? 'HIGH' :
                   matchState.pressure > 30 ? 'MED' : 'LOW'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* === RIGHT COLUMN — Status + Selections === */}
        <div className="match-right">
          {/* Batsman vs Bowler status */}
          <div className="status-card">
            <div className="status-batting">
              {striker && (
                <div className="status-batter">
                  <span className="strike" />
                  <span className="name">{striker.name}</span>
                  <span className={`hand-chip ${matchState.strikerHanded === 'left' ? 'left-handed' : ''}`} title={matchState.strikerHanded === 'left' ? 'Left-handed batsman' : 'Right-handed batsman'}>
                    {matchState.strikerHanded === 'left' ? 'LH' : 'RH'}
                  </span>
                  <span className="score num">{striker.runs}</span>
                  <span className="balls num">({striker.balls})</span>
                </div>
              )}
              {nonStriker && (
                <div className="status-batter dim">
                  <span style={{ width: 7, flexShrink: 0 }} />
                  <span className="name">{nonStriker.name}</span>
                  <span className="hand-chip" style={{ opacity: 0.5 }} title="Non-striker">
                    {matchState.nonStrikerHanded === 'left' ? 'LH' : 'RH'}
                  </span>
                  <span className="score num">{nonStriker.runs}</span>
                  <span className="balls num">({nonStriker.balls})</span>
                </div>
              )}
            </div>
            <div className="status-bowler">
              <div className="bowler-icon">⚾</div>
              {matchState.currentBowler ? (
                <>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="name">{matchState.currentBowler.name}</div>
                    <div className="type">{matchState.currentBowler.typeName || matchState.currentBowler.type}</div>
                  </div>
                  {bowlerFigureText && (
                    <div className="figures num">{bowlerFigureText}</div>
                  )}
                </>
              ) : (
                <div className="name" style={{ color: 'var(--text-3)' }}>Selecting bowler…</div>
              )}
            </div>
          </div>

          {/* Phase content — selections, results, etc. */}
          <div className="match-right-scroll">
            {renderPhase()}
          </div>
        </div>
      </div>

      {/* Team info button — bottom-right corner */}
      <button className="team-info-btn" onClick={() => setShowTeam(true)} title="View team">
        👥
      </button>

      {/* Team modal */}
      {showTeam && (
        <TeamPanel matchState={matchState} onClose={() => setShowTeam(false)} />
      )}
    </div>
  )
}
