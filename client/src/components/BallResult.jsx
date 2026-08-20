import { useState } from 'react'

export default function BallResult({ result }) {
  const [showExplanation, setShowExplanation] = useState(false)

  if (!result) return null

  const outcome = result.outcome
  const runs = outcome?.runs || 0
  const isWicket = outcome?.wicket
  const isWide = outcome?.isWide
  const isNoBall = outcome?.isNoBall

  const heroClass = () => {
    if (isWicket) return 'wicket'
    if (isWide || isNoBall) return 'extra'
    if (runs === 6) return 'six'
    if (runs === 4) return 'four'
    if (runs >= 1) return 'run'
    return 'dot'
  }

  const heroText = () => {
    if (isWicket) return 'W'
    if (isWide) return 'WD'
    if (isNoBall) return 'NB'
    if (runs === 0) return '•'
    return runs
  }

  return (
    <div className="ball-result">
      <div className={`result-hero ${heroClass()}`}>
        {heroText()}
      </div>

      <div className="result-description">
        {outcome?.description || 'Ball bowled'}
      </div>

      <div className="result-score-line num">
        {result.score}/{result.wickets} · Over {result.over}.{result.ball}
      </div>

      {/* Confidence update */}
      {result.confidence && (
        <div className="result-chips">
          <span className="result-chip bat">
            BAT <b className="num">{result.confidence.batsman}</b>
          </span>
          <span className="result-chip bowl">
            BOWL <b className="num">{result.confidence.bowler}</b>
          </span>
        </div>
      )}

      {/* Why button */}
      {result.explanation?.length > 0 && (
        <>
          <button
            className="why-btn"
            onClick={() => setShowExplanation(!showExplanation)}
          >
            {showExplanation ? '▲ Hide' : '🔍 Why?'} Explain this result
          </button>

          {showExplanation && (
            <div className="result-explanation">
              <h4>How this happened</h4>
              {result.explanation.map((line, i) => (
                <p key={i}>
                  {line.includes(':') ? (
                    <>
                      <span className="highlight">{line.split(':')[0]}:</span>
                      {line.split(':').slice(1).join(':')}
                    </>
                  ) : (
                    line
                  )}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
