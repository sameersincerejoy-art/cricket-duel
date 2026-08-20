import { useState, useEffect, createContext, useContext } from 'react'
import { io } from 'socket.io-client'
import Lobby from './components/Lobby'
import MatchLobby from './components/MatchLobby'
import Toss from './components/Toss'
import Match from './components/Match'
import Scorecard from './components/Scorecard'

const SocketContext = createContext(null)
export const useSocket = () => useContext(SocketContext)

// Dev: Vite serves the client on 5173, sockets live on 3001.
// Production: the express server serves both — derive from the page origin
// so it works on any port (default 3001 or a custom one).
// In dev mode Vite runs on 5173 and the server on 3001.
// Use window.location.hostname so that when the page is opened from
// another device on the same network the socket connects to the PC's
// IP rather than "localhost" (which would point at the phone itself).
const SERVER_URL = import.meta.env.DEV
  ? `http://${window.location.hostname}:3001`
  : `${window.location.protocol}//${window.location.hostname}:${window.location.port}`

export default function App() {
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [screen, setScreen] = useState('lobby') // lobby, matchLobby, toss, match, scorecard
  const [gameState, setGameState] = useState(null)
  const [matchState, setMatchState] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const newSocket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    })

    newSocket.on('connect', () => {
      setConnected(true)
      setError(null)
    })

    newSocket.on('disconnect', () => {
      setConnected(false)
    })

    newSocket.on('connect_error', () => {
      setError('Cannot connect to server. Make sure the server is running.')
    })

    newSocket.on('player_joined', (data) => {
      setGameState(prev => ({ ...prev, ...data, teams: data.teams || prev?.teams }))
      setScreen('matchLobby')
    })

    newSocket.on('toss_started', () => {
      setScreen('toss')
    })

    newSocket.on('toss_result', (data) => {
      setGameState(prev => ({ ...prev, tossResult: data }))
    })

    newSocket.on('toss_decision_made', (data) => {
      setGameState(prev => ({ ...prev, tossDecision: data }))
      setScreen('match')
    })

    newSocket.on('match_state', (data) => {
      setMatchState(prev => ({ ...prev, ...data, phase: data.phase || prev?.phase }))
    })

    newSocket.on('bowler_choose_delivery', (data) => {
      setMatchState(prev => ({ ...prev, phase: 'bowler_choose', bowlerData: data }))
    })

    newSocket.on('batsman_choose_shot', (data) => {
      setMatchState(prev => ({ ...prev, phase: 'batsman_choose', batsmanData: data }))
    })

    newSocket.on('waiting_for', (data) => {
      setMatchState(prev => ({ ...prev, phase: 'waiting', waitingMessage: data.message }))
    })

    newSocket.on('ball_result', (data) => {
      setMatchState(prev => ({ ...prev,
        phase: 'result',
        lastResult: data,
        // Update score/wickets immediately so the UI reflects the outcome
        score: data.score ?? prev?.score,
        wickets: data.wickets ?? prev?.wickets,
        currentOver: data.over ?? prev?.currentOver,
        currentBall: data.ball ?? prev?.currentBall,
        confidence: data.confidence ?? prev?.confidence,
        pressure: data.pressure ?? prev?.pressure,
        ballHistory: [
          ...(prev?.ballHistory || []),
          { result: data.outcome?.runs, wicket: data.outcome?.wicket, isWide: data.outcome?.isWide, isNoBall: data.outcome?.isNoBall },
        ],
      }))
    })

    newSocket.on('new_over', (data) => {
      setMatchState(prev => ({ ...prev,
        phase: 'new_over',
        newOverData: data,
        currentOver: data.over ?? prev?.currentOver,
        score: data.score ? data.score[prev?.battingTeamIndex ?? 0] : prev?.score,
        wickets: data.wickets ? data.wickets[prev?.battingTeamIndex ?? 0] : prev?.wickets,
      }))
    })

    newSocket.on('innings_break', (data) => {
      setMatchState(prev => ({ ...prev, phase: 'innings_break', inningsBreakData: data }))
      // Show the target, then move on to bowler selection. The server does not
      // broadcast a phase change after the break, so transition here or the
      // match would stall on this screen forever.
      setTimeout(() => {
        setMatchState(prev => {
          if (prev?.phase === 'innings_break') {
            return { ...prev, phase: 'bowler_select' }
          }
          return prev
        })
      }, 4500)
    })

    newSocket.on('match_completed', (data) => {
      setMatchState(prev => ({ ...prev, phase: 'completed', completedData: data }))
      setScreen('scorecard')
    })

    newSocket.on('field_changed', (data) => {
      // The batsman sees a brief flash on the field when it changes (design
      // doc point: bowler changes field → batsman gets notified).
      setMatchState(prev => ({ ...prev, fieldPreset: data.preset, fielders: data.fielders, fielderRoster: data.fielderRoster, fieldFlashKey: Date.now() }))
    })

    newSocket.on('player_disconnected', () => {
      setError('Opponent disconnected')
    })

    setSocket(newSocket)

    return () => {
      newSocket.close()
    }
  }, [])

  const renderScreen = () => {
    switch (screen) {
      case 'lobby':
        return <Lobby socket={socket} connected={connected} onGameCreated={(data) => {
          setGameState(data)
          setScreen('matchLobby')
        }} />
      case 'matchLobby':
        return <MatchLobby socket={socket} gameState={gameState} onStartToss={() => {
          socket.emit('start_toss', gameState.matchCode)
        }} />
      case 'toss':
        return <Toss socket={socket} gameState={gameState} />
      case 'match':
        return <Match socket={socket} gameState={gameState} matchState={matchState} />
      case 'scorecard':
        return <Scorecard matchState={matchState} onPlayAgain={() => {
          setScreen('lobby')
          setGameState(null)
          setMatchState(null)
        }} />
      default:
        return <Lobby socket={socket} connected={connected} />
    }
  }

  return (
    <SocketContext.Provider value={socket}>
      <div className="app">
        {error && (
          <div className="error-banner" onClick={() => setError(null)}>
            ⚠️ {error}
          </div>
        )}
        {renderScreen()}
      </div>
    </SocketContext.Provider>
  )
}
