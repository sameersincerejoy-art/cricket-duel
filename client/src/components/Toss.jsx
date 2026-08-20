import { useState, useEffect } from 'react'

export default function Toss({ socket, gameState }) {
  const [phase, setPhase] = useState('call') // call, flipping, result, decision, waiting
  const [call, setCall] = useState(null)
  const [result, setResult] = useState(null)
  const [won, setWon] = useState(false)
  const [winnerName, setWinnerName] = useState('')
  const [flipping, setFlipping] = useState(false)

  useEffect(() => {
    if (!socket) return

    const handleTossResult = (data) => {
      setFlipping(true)
      setResult(data.result)
      setWinnerName(data.winnerName)

      setTimeout(() => {
        setFlipping(false)
        setWon(data.winnerSocketId === socket.id)
        setPhase('result')

        setTimeout(() => {
          if (data.winnerSocketId === socket.id) {
            setPhase('decision')
          } else {
            setPhase('waiting')
          }
        }, 2000)
      }, 1000)
    }

    const handleTossDecision = () => {
      setPhase('waiting')
    }

    socket.on('toss_result', handleTossResult)
    socket.on('toss_decision_made', handleTossDecision)

    return () => {
      socket.off('toss_result', handleTossResult)
      socket.off('toss_decision_made', handleTossDecision)
    }
  }, [socket])

  const handleCall = (choice) => {
    setCall(choice)
    setPhase('flipping')
    socket.emit('call_toss', gameState.matchCode, choice, () => {})
  }

  const handleDecision = (decision) => {
    socket.emit('toss_decision', gameState.matchCode, decision, () => {})
    setPhase('waiting')
  }

  return (
    <div className="toss-screen">
      <div className="toss-kicker">The Toss</div>

      <div className={`coin ${flipping ? 'flipping' : ''}`}>
        {phase === 'call' ? '🪙' : flipping ? '🪙' : won ? '🏆' : '⚖️'}
      </div>

      {phase === 'call' && (
        <>
          <p className="toss-call-text">Call it — heads or tails?</p>
          <div className="btn-pair" style={{ width: '100%', maxWidth: 300 }}>
            <button className="btn btn-primary" onClick={() => handleCall('heads')}>
              Heads
            </button>
            <button className="btn btn-secondary" onClick={() => handleCall('tails')}>
              Tails
            </button>
          </div>
        </>
      )}

      {phase === 'result' && (
        <div className="toss-result-card">
          <h2 className={won ? 'toss-win' : ''}>
            {won ? '🎉 You won the toss!' : 'You lost the toss'}
          </h2>
          <p>
            It was <b>{result}</b>. {winnerName} won.
          </p>
        </div>
      )}

      {phase === 'decision' && (
        <div className="toss-result-card">
          <h2 className="toss-win">Your call, captain</h2>
          <p>Would you like to bat or bowl first?</p>
          <div className="btn-pair">
            <button className="btn btn-primary" onClick={() => handleDecision('bat')}>
              🏏 Bat
            </button>
            <button className="btn btn-secondary" onClick={() => handleDecision('bowl')}>
              ⚾ Bowl
            </button>
          </div>
        </div>
      )}

      {phase === 'waiting' && (
        <div className="toss-result-card">
          <div className="spinner" style={{ margin: '0 auto 14px' }} />
          <p style={{ marginBottom: 0, animation: 'pulse 1.5s ease-in-out infinite' }}>
            Waiting for the game to start…
          </p>
        </div>
      )}
    </div>
  )
}
