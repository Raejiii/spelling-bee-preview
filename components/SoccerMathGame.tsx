import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import confetti from 'canvas-confetti'
import { VolumeX, Play, RotateCcw, HelpCircle, X, Pause, Music } from 'lucide-react'
import { cn } from '../lib/utils'
import { gameConfig } from '../config/game-config'

// Game constants
const QUESTION_COUNT = 10
const ANIMATION_DURATION = 800 // ms

// Goal positions for horizontal distribution (distance-based)
const GOAL_POSITIONS = [
  { x: 40, y: 50 }, // Close
  { x: 65, y: 50 }, // Mid
  { x: 90, y: 50 }  // Far
]

type GameState = 'menu' | 'settings' | 'playing' | 'finished'
type Operation = 'addition' | 'subtraction' | 'multiplication' | 'division'
type NumberType = 'whole' | 'integer'

interface Question {
  num1: number
  num2: number
  answer: number
  options: number[]
  symbol: string
}

export default function SoccerMathGame() {
  const [gameState, setGameState] = useState<GameState>('menu')
  const [selectedOperation, setSelectedOperation] = useState<Operation>('addition')
  const [selectedNumberType, setSelectedNumberType] = useState<NumberType>('whole')
  const [score, setScore] = useState(0)
  const [misses, setMisses] = useState(0)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [ballPosition, setBallPosition] = useState({ x: 12, y: 58 }) // Percentages - Next to feet
  const [isKicking, setIsKicking] = useState(false)
  const [kickerFrame, setKickerFrame] = useState(1) // 1: Idle, 2: Windup/Contact, 3: Follow-through
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null)
  const [showKicker, setShowKicker] = useState(true)
  
  // Kicking Power States - using Ref for performance to avoid re-renders
  const kickPowerRef = useRef(0)
  const powerBarFillRef = useRef<HTMLDivElement>(null)
  const [activeTargetIndex, setActiveTargetIndex] = useState<number>(0)
  const [isCharging, setIsCharging] = useState(false)
  const chargeIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // UI States from PoolGame
  const [showSidebar, setShowSidebar] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  
  // Audio refs
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({})
  const ballRef = useRef<HTMLDivElement>(null)

  const playAudio = (name: string, loop: boolean = false): void => {
    if (!isMuted) {
      if (!audioRefs.current[name]) {
        const src = (gameConfig.audio as unknown as Record<string, string>)[name]
        if (src) {
          audioRefs.current[name] = new Audio(src)
          if (audioRefs.current[name]) {
            audioRefs.current[name]!.loop = loop
          }
        }
      }

      if (audioRefs.current[name] && audioRefs.current[name]!.paused) {
        audioRefs.current[name]!
          .play()
          .catch((error) => {
            console.error(`Error playing audio ${name}:`, error)
          })
      }
    }
  }

  const pauseAudio = (name: string): void => {
    if (audioRefs.current[name]) {
      audioRefs.current[name]!.pause()
    }
  }

  const stopAllAudio = (): void => {
    Object.values(audioRefs.current).forEach((audio) => {
      if (audio) {
        audio.pause()
        audio.currentTime = 0
      }
    })
  }

  useEffect(() => {
    // Initial setup - don't auto-start game
    // generateQuestion() 
    // setShowHelp(true)
    // setIsPaused(true)
    // playAudio("instructions")
    
    return () => {
      stopAllAudio()
      if (chargeIntervalRef.current) clearInterval(chargeIntervalRef.current)
    }
  }, [])

  // Spacebar Handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !isKicking && !isPaused && gameState === 'playing') {
        setIsCharging(true)
        kickPowerRef.current = 0
        setActiveTargetIndex(0)
        
        // Reset visual bar
        if (powerBarFillRef.current) {
            powerBarFillRef.current.style.width = '0%'
            powerBarFillRef.current.className = "h-full transition-all duration-75 ease-linear bg-green-400"
        }

        // Start charging
        if (chargeIntervalRef.current) clearInterval(chargeIntervalRef.current)
        chargeIntervalRef.current = setInterval(() => {
          if (kickPowerRef.current < 100) {
            kickPowerRef.current += 4
          } else {
            kickPowerRef.current = 100
          }
          
          const currentPower = kickPowerRef.current
          
          // Update visual bar directly
          if (powerBarFillRef.current) {
            powerBarFillRef.current.style.width = `${currentPower}%`
            
            // Update color based on thresholds
            if (currentPower > 66) {
                powerBarFillRef.current.className = "h-full transition-all duration-75 ease-linear bg-red-500"
            } else if (currentPower > 33) {
                powerBarFillRef.current.className = "h-full transition-all duration-75 ease-linear bg-yellow-400"
            } else {
                powerBarFillRef.current.className = "h-full transition-all duration-75 ease-linear bg-green-400"
            }
          }

          // Update target index state (only triggers render when value changes)
          let newTargetIndex = 0
          if (currentPower > 66) newTargetIndex = 2
          else if (currentPower > 33) newTargetIndex = 1
          
          setActiveTargetIndex(prev => {
              if (prev !== newTargetIndex) return newTargetIndex
              return prev
          })

        }, 40)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isKicking && !isPaused && gameState === 'playing') {
        setIsCharging(false)
        if (chargeIntervalRef.current) {
          clearInterval(chargeIntervalRef.current)
          chargeIntervalRef.current = null
        }
        
        // Use the ref value
        const power = kickPowerRef.current
        
        let targetIndex = 0
        if (power > 66) targetIndex = 2
        else if (power > 33) targetIndex = 1
        
        // Find the answer at this index
        if (currentQuestion && currentQuestion.options[targetIndex] !== undefined) {
            handleAnswer(currentQuestion.options[targetIndex], targetIndex)
        }
        kickPowerRef.current = 0
        if (powerBarFillRef.current) {
            powerBarFillRef.current.style.width = '0%'
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [isKicking, isPaused, gameState, currentQuestion]) // Removed kickPower dependency

  // Background music management
  useEffect(() => {
    if (!isPaused && !isMuted) {
      playAudio("background", true)
    } else {
      pauseAudio("background")
    }
  }, [isPaused, isMuted])


  // Timer effect
  useEffect(() => {
    if (isPaused || gameState !== 'playing') return
    const id = setInterval(() => {
      setElapsedSeconds((s) => s + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [isPaused, gameState])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
  }

  const togglePause = () => {
    setIsPaused((p) => {
      const next = !p
      setShowSidebar(next)
      return next
    })
  }

  const toggleMute = () => {
    setIsMuted((m) => {
      const next = !m
      if (next) {
        stopAllAudio()
      } else {
        if (!isPaused) {
          playAudio("background", true)
        }
      }
      return next
    })
  }

  const openHelp = () => {
    setShowHelp(true)
    setIsPaused(true)
    setShowSidebar(true)
    playAudio("instructions")
  }

  const closeHelp = (startGameAfter = false) => {
    setShowHelp(false)
    if (gameState === 'menu') {
      if (startGameAfter === true) {
        startGame()
      }
    } else {
      setIsPaused(false)
    }
    setShowSidebar(false)
    pauseAudio("instructions")
    if (!isMuted && gameState !== 'menu') {
      playAudio("background", true)
    }
  }

  const resetRound = () => {
    setGameState('playing')
    setScore(0)
    setMisses(0)
    setQuestionIndex(0)
    setElapsedSeconds(0)
    setFeedback(null)
    setIsKicking(false)
    setKickerFrame(1)
    setShowKicker(true)
    setBallPosition({ x: 12, y: 58 })
    generateQuestion()
    setIsPaused(false)
    setShowSidebar(false)
    kickPowerRef.current = 0
    if (powerBarFillRef.current) {
        powerBarFillRef.current.style.width = '0%'
    }
  }

  const generateQuestion = () => {
    let num1, num2, answer, symbol
    const isInteger = selectedNumberType === 'integer'
    const min = isInteger ? -10 : 1
    const max = 10

    switch (selectedOperation) {
        case 'addition':
            num1 = Math.floor(Math.random() * (max - min + 1)) + min
            num2 = Math.floor(Math.random() * (max - min + 1)) + min
            answer = num1 + num2
            symbol = '+'
            break
        case 'subtraction':
            num1 = Math.floor(Math.random() * (max - min + 1)) + min
            num2 = Math.floor(Math.random() * (max - min + 1)) + min
            // Ensure positive result for whole numbers if needed, but standard subtraction is fine
            if (!isInteger && num1 < num2) [num1, num2] = [num2, num1]
            answer = num1 - num2
            symbol = '-'
            break
        case 'multiplication':
            num1 = Math.floor(Math.random() * (max - min + 1)) + min
            num2 = Math.floor(Math.random() * (max - min + 1)) + min
            answer = num1 * num2
            symbol = '×'
            break
        case 'division':
            // Generate multiplication first to ensure clean division
            num2 = Math.floor(Math.random() * (max - 1)) + 1 // Avoid 0 or negative division issues slightly
            if (isInteger && num2 === 0) num2 = 1 
            const factor = Math.floor(Math.random() * 10) + 1
            num1 = num2 * factor * (isInteger && Math.random() > 0.5 ? -1 : 1)
            answer = num1 / num2
            symbol = '÷'
            break
        default:
            num1 = 1
            num2 = 1
            answer = 2
            symbol = '+'
    }
    
    // Generate options
    const options = new Set<number>()
    options.add(answer)
    
    while (options.size < 3) {
      let wrong
      if (selectedOperation === 'multiplication' || selectedOperation === 'division') {
          wrong = answer + (Math.floor(Math.random() * 10) - 5)
      } else {
          wrong = answer + (Math.floor(Math.random() * 6) - 3)
      }
      
      if (wrong !== answer) {
        options.add(wrong)
      }
    }
    
    setCurrentQuestion({
      num1,
      num2,
      answer,
      options: Array.from(options).sort(() => Math.random() - 0.5),
      symbol
    })
    
    // Reset ball and feedback
    setBallPosition({ x: 12, y: 58 })
    setFeedback(null)
    setIsKicking(false)
    setKickerFrame(1)
    setShowKicker(true)
  }

  // Ensure ball position is maintained when switching to kicking state
  useLayoutEffect(() => {
    if (isKicking && ballRef.current) {
      ballRef.current.style.left = `${ballPosition.x}%`
      ballRef.current.style.top = `${ballPosition.y}%`
    }
  }, [isKicking, ballPosition])

  const handleAnswer = (selectedAnswer: number, index: number) => {
    if (isKicking || isPaused || gameState !== 'playing') return

    setIsKicking(true)
    playAudio("uiClick")
    
    // Start Kick Animation Sequence
    // Frame 1 (Idle) -> Frame 2 (Contact) -> Frame 3 (Follow through)
    setKickerFrame(2)
    
    setTimeout(() => {
      setKickerFrame(3)
      startBallAnimation(selectedAnswer, index)
    }, 100)
  }

  const startBallAnimation = (selectedAnswer: number, index: number) => {
    // Target based on the goal position
    const target = GOAL_POSITIONS[index % GOAL_POSITIONS.length]
    
    // Start Animation Loop
    const startTime = performance.now()
    const startPos = { x: 12, y: 58 }
    // Control point for curve: "Vertical" arc (up towards top of screen)
    // Start (12,58) -> End (TargetX, 50)
    // Mid Point X = (12 + TargetX) / 2
    // Mid Point Y = 10 (High arc towards top of screen)
    const controlPos = { x: (startPos.x + target.x) / 2, y: 10 }
    
    const animateBall = (currentTime: number) => {
        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / ANIMATION_DURATION, 1)
        
        // Quadratic Bezier Curve
        const t = progress
        const x = Math.pow(1 - t, 2) * startPos.x + 2 * (1 - t) * t * controlPos.x + Math.pow(t, 2) * target.x
        const y = Math.pow(1 - t, 2) * startPos.y + 2 * (1 - t) * t * controlPos.y + Math.pow(t, 2) * target.y
        
        // Direct DOM update for performance
        if (ballRef.current) {
            ballRef.current.style.left = `${x}%`
            ballRef.current.style.top = `${y}%`
        }
        
        if (progress < 1) {
            requestAnimationFrame(animateBall)
        } else {
            // Animation Complete
            finishKick(selectedAnswer)
        }
    }
    
    requestAnimationFrame(animateBall)
  }
  
  const finishKick = (selectedAnswer: number) => {
      const isCorrect = selectedAnswer === currentQuestion?.answer
      
      if (isCorrect) {
        setScore(s => s + 1)
        setFeedback('correct')
        playAudio("success")
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        })
      } else {
        setMisses(m => m + 1)
        setFeedback('incorrect')
        playAudio("incorrect")
      }

      setTimeout(() => {
        if (questionIndex < QUESTION_COUNT - 1) {
          setQuestionIndex(i => i + 1)
          generateQuestion()
        } else {
          setGameState('finished')
          setIsPaused(true)
        }
      }, 1500)
  }

  const startGame = () => {
    setGameState('settings')
  }

  const startMatch = () => {
    setGameState('playing')
    setScore(0)
    setMisses(0)
    setQuestionIndex(0)
    setElapsedSeconds(0)
    generateQuestion()
    setIsPaused(false)
    setShowHelp(false)
  }

  return (
    <div className="relative w-full h-full overflow-hidden select-none font-sans">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <img 
          src="./Desktop Spot kicker.svg" 
          alt="Soccer Field Background" 
          className="w-full h-full object-cover"
        />
      </div>

      {/* --- NEW UI ELEMENTS --- */}

      {gameState !== 'menu' && (
        <>
      {/* Top-right Help button */}
      <div className="fixed top-4 right-4 z-[60]">
        <button
          onClick={openHelp}
          className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center transition-colors shadow-lg"
          aria-label="Help"
        >
          <HelpCircle className="w-6 h-6 sm:w-8 sm:h-8 lg:w-12 lg:h-12 text-white" />
        </button>
      </div>

      {/* Pause Sidebar Controls */}
      <div
        className={`fixed top-4 left-4 z-[60] transition-all duration-300 ${
          showSidebar ? "w-14 sm:w-16 lg:w-20" : "w-10 sm:w-12 lg:w-16"
        }`}
      >
        <div className="flex flex-col items-center gap-2 sm:gap-4 lg:gap-6">
          <button
            onClick={togglePause}
            className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-full bg-violet-500 hover:bg-violet-600 flex items-center justify-center transition-colors shadow-lg"
            aria-label={showSidebar ? "Resume game" : "Pause game"}
          >
            {showSidebar ? (
              <Play className="w-6 h-6 sm:w-8 sm:h-8 lg:w-12 lg:h-12 text-white" />
            ) : (
              <Pause className="w-6 h-6 sm:w-8 sm:h-8 lg:w-12 lg:h-12 text-white" />
            )}
          </button>
          {showSidebar && (
            <>
              <button
                onClick={toggleMute}
                className={`w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-full ${
                  isMuted ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"
                } flex items-center justify-center transition-colors shadow-lg`}
                aria-label={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? (
                  <VolumeX className="w-5 h-5 sm:w-6 sm:h-6 lg:w-10 lg:h-10 text-white" />
                ) : (
                  <Music className="w-5 h-5 sm:w-6 sm:h-6 lg:w-10 lg:h-10 text-white" />
                )}
              </button>
              <button
                onClick={resetRound}
                className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-full bg-yellow-500 hover:bg-yellow-600 flex items-center justify-center transition-colors shadow-lg"
                aria-label="Reset round"
              >
                <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6 lg:w-10 lg:h-10 text-white" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Dev: Finish Game Button */}
      {gameState === 'playing' && (
        <div className="fixed bottom-4 right-4 z-[60] opacity-50 hover:opacity-100 transition-opacity">
            <button
                onClick={() => setGameState('finished')}
                className="bg-red-500 text-white px-2 py-1 rounded text-xs"
            >
                Force End
            </button>
        </div>
      )}

      {/* Title and Timer Header */}
      <div className="absolute top-0 left-0 w-full z-40 flex flex-col items-center justify-start pointer-events-none">
        <div className="w-full px-2 sm:px-4 pt-4 sm:pt-8 pb-2 sm:pb-4 flex items-center justify-center">
          <div className="text-center">
            <div
              style={{
                color: "#fff",
                textAlign: "center",
                fontFamily: 'Luckiest Guy',
                fontSize: "38px",
                fontStyle: "normal",
                fontWeight: 400,
                lineHeight: "28px",
                letterSpacing: "3.8px",
                textTransform: "uppercase",
                textShadow: "2px 2px 0 #000"
              }}
            >
              SOCCER MATH
            </div>
            <div className="mt-3 sm:mt-4 lg:mt-5 inline-flex items-center gap-2 text-white font-semibold bg-black/30 px-4 py-1 rounded-full">
              <img src="./time-hourglass-H3UkbK6hVS.svg" alt="Timer" className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7" />
              <span
                style={{
                  fontFamily: "Nunito",
                  fontSize: "22px",
                  fontWeight: 800,
                  lineHeight: 1,
                }}
              >
                {formatTime(elapsedSeconds)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Score Display (Updated Style) */}
      <div className="absolute top-24 right-4 z-40 bg-white/90 p-2 rounded-xl shadow-lg flex flex-col items-center min-w-[80px]">
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Score</div>
        <div className="text-xl font-black text-green-600" style={{ fontFamily: "Bubblegum Sans" }}>{score} / {QUESTION_COUNT}</div>
      </div>

      {/* Power Bar */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 w-64 md:w-96 z-50">
        <div className="bg-black/50 p-2 rounded-full border-2 border-white/30 backdrop-blur-sm">
           <div className="h-4 md:h-6 w-full bg-gray-700 rounded-full overflow-hidden relative">
              {/* Power Segments Indicators */}
              <div className="absolute top-0 left-[33%] h-full w-0.5 bg-white/30 z-10"></div>
              <div className="absolute top-0 left-[66%] h-full w-0.5 bg-white/30 z-10"></div>
              
              {/* Fill */}
              <div 
                ref={powerBarFillRef}
                className="h-full transition-all duration-75 ease-linear bg-green-400"
                style={{ width: '0%' }}
              ></div>
           </div>
           <div className="flex justify-between text-white text-[10px] md:text-xs font-bold mt-1 px-1" style={{ fontFamily: "Nunito" }}>
             <span>CLOSE</span>
             <span>MID</span>
             <span>FAR</span>
           </div>
        </div>
        <div className="text-center text-white font-bold text-sm mt-2 animate-pulse drop-shadow-md">
          HOLD SPACE TO KICK
        </div>
      </div>
      </>
      )}

      {/* Game Content */}
      {currentQuestion && (
        <>
          {/* Question Banner */}
          <div className="absolute top-[20%] sm:top-[28%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-40 w-full flex justify-center px-4">
            <div className="bg-white border-4 border-green-500 rounded-2xl px-4 py-2 md:px-6 md:py-3 shadow-xl transform rotate-[-2deg] hover:rotate-0 transition-transform max-w-full">
              <div className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-green-600 flex gap-2 sm:gap-3 items-center" style={{ fontFamily: "Bubblegum Sans" }}>
                <span>{currentQuestion.num1}</span>
                <span>{currentQuestion.symbol}</span>
                <span>{currentQuestion.num2}</span>
                <span>=</span>
                <span>?</span>
              </div>
            </div>
          </div>

          {/* Goal Targets (Horizontal Distribution) */}
          {currentQuestion.options.map((opt, idx) => {
            const pos = GOAL_POSITIONS[idx % GOAL_POSITIONS.length]
            // Highlight based on current power if charging
            let isTargeted = false
            if (isCharging) {
                if (idx === activeTargetIndex) isTargeted = true
            }

            return (
              <div
                key={idx}
                className="absolute z-40 w-20 h-16 sm:w-28 sm:h-20 md:w-32 md:h-24 lg:w-40 lg:h-32 group transition-transform duration-100"
                style={{ 
                  left: `${pos.x}%`, 
                  top: `${pos.y}%`,
                  transform: isTargeted ? 'translate(-50%, -50%) scale(1.1)' : 'translate(-50%, -50%) scale(1)'
                }}
              >
                 {/* Goal Post Structure */}
                 <div className="absolute inset-0 flex items-center justify-center">
                    <img 
                      src="./Group 26086646.svg" 
                      alt="Goal" 
                      className={cn(
                        "w-full h-full object-contain drop-shadow-md transition-all duration-100",
                        isTargeted ? "drop-shadow-[0_0_15px_rgba(250,204,21,0.8)] brightness-110" : ""
                      )}
                    />
                    
                    {/* Answer Number with Ellipse Background */}
                    <div className="absolute z-10 mt-8 sm:mt-12 md:mt-16 lg:mt-20 flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 lg:w-14 lg:h-14">
                       <img 
                         src="./Ellipse 1058.svg" 
                         alt="bg" 
                         className="absolute inset-0 w-full h-full"
                       />
                       <span className="relative z-20 text-sm sm:text-lg md:text-xl lg:text-2xl font-bold text-red-600" style={{ fontFamily: "Bubblegum Sans" }}>
                         {opt}
                       </span>
                    </div>
                 </div>
              </div>
            )
          })}

          {/* Player (Kicker) - Left Side */}
          <div className="absolute left-[2%] sm:left-[5%] top-1/2 transform -translate-y-1/2 h-16 sm:h-24 md:h-32 lg:h-40 z-20 transition-opacity duration-300" style={{ opacity: showKicker ? 1 : 0.5 }}>
             <img 
               src={
                 kickerFrame === 2 ? "./Property%201=2.svg" : 
                 kickerFrame === 3 ? "./Property%201=3.svg" : 
                 "./boy.svg"
               } 
               alt="Kicker" 
               className="h-full w-auto object-contain" 
             />
          </div>

          {/* Ball */}
          <div 
            ref={ballRef}
            className="absolute w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 lg:w-14 lg:h-14 z-30"
            style={{ 
              left: isKicking ? undefined : `${ballPosition.x}%`,
              top: isKicking ? undefined : `${ballPosition.y}%`,
              transform: 'translate(-50%, -50%)',
              // Remove transition during kick to allow smooth JS animation
              transition: isKicking ? 'none' : 'all 300ms ease-out'
            }}
          >
            <img 
              src="./ball.svg" 
              alt="Soccer Ball" 
              className={cn(
                "w-full h-full object-contain drop-shadow-lg",
                isKicking && "animate-spin"
              )} 
            />
          </div>

          {/* Feedback Overlay */}
          {feedback && (
            <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
              <div className={cn(
                "text-4xl sm:text-6xl md:text-8xl font-black drop-shadow-[0_5px_5px_rgba(0,0,0,0.5)] animate-in zoom-in duration-300",
                feedback === 'correct' ? "text-yellow-400" : "text-red-500"
              )} style={{ fontFamily: "Luckiest Guy" }}>
                {feedback === 'correct' ? 'GOAL!' : 'MISS!'}
              </div>
            </div>
          )}
        </>
      )}

      {/* Settings Menu */}
      {gameState === 'settings' && (
        <div className="absolute inset-0 z-[70] flex flex-col items-center justify-start pt-4 sm:pt-8 animate-in fade-in duration-500 overflow-y-auto">
           {/* Background Image (Same as game) */}
           <div className="absolute inset-0 z-0">
             <img 
               src="./Desktop Spot kicker.svg" 
               alt="Soccer Field Background" 
               className="w-full h-full object-cover"
             />
           </div>
           
           {/* Content Container - Relative to sit above background */}
           <div className="relative z-10 w-full h-full flex flex-col items-center justify-start pt-4 sm:pt-8">
           
           {/* Header */}
           <div className="mb-6 md:mb-8 text-center px-4">
              <div
                style={{
                  color: "#fff",
                  fontFamily: 'Luckiest Guy',
                  lineHeight: "1.2",
                  textTransform: "uppercase",
                  textShadow: "2px 2px 0 #000"
                }}
                className="drop-shadow-lg tracking-wide text-2xl sm:text-4xl md:text-5xl"
              >
                PICK ANYTHING YOU WANT TO PLAY ON
              </div>
           </div>

           {/* Operations Row */}
           <div className="flex flex-wrap justify-center gap-4 md:gap-8 mb-8 md:mb-12 px-4 w-full max-w-4xl">
              {(['addition', 'subtraction', 'multiplication', 'division'] as const).map((op) => (
                <button
                  key={op}
                  onClick={() => setSelectedOperation(op)}
                  className={`group relative w-16 h-16 sm:w-20 sm:h-20 md:w-28 md:h-28 rounded-full bg-white flex items-center justify-center shadow-[0_8px_0_rgba(0,0,0,0.2)] transition-all active:translate-y-1 active:shadow-none hover:scale-105 ${selectedOperation === op ? 'ring-4 ring-yellow-400 ring-offset-4 ring-offset-transparent scale-110' : ''}`}
                >
                   {/* Ball Texture Overlay */}
                   <div className="absolute inset-0 rounded-full opacity-10 bg-[url('./ball.svg')] bg-cover mix-blend-multiply"></div>
                   
                   {/* Symbol */}
                   {op === 'addition' && <span className="text-4xl sm:text-5xl md:text-6xl font-black text-red-500 drop-shadow-md" style={{ fontFamily: "Luckiest Guy" }}>+</span>}
                   {op === 'subtraction' && <span className="text-4xl sm:text-5xl md:text-6xl font-black text-purple-500 drop-shadow-md" style={{ fontFamily: "Luckiest Guy" }}>-</span>}
                   {op === 'multiplication' && <span className="text-4xl sm:text-5xl md:text-6xl font-black text-emerald-500 drop-shadow-md" style={{ fontFamily: "Luckiest Guy" }}>×</span>}
                   {op === 'division' && <span className="text-4xl sm:text-5xl md:text-6xl font-black text-blue-500 drop-shadow-md" style={{ fontFamily: "Luckiest Guy" }}>÷</span>}
                </button>
              ))}
           </div>

           {/* Number Types Row */}
           <div className="flex justify-center gap-4 sm:gap-8 md:gap-16 mb-8 md:mb-12">
              <button
                onClick={() => setSelectedNumberType('whole')}
                className={`group relative w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-full bg-white flex flex-col items-center justify-center shadow-[0_8px_0_rgba(0,0,0,0.2)] transition-all active:translate-y-1 active:shadow-none hover:scale-105 ${selectedNumberType === 'whole' ? 'ring-4 ring-yellow-400 ring-offset-4 ring-offset-transparent scale-110' : ''}`}
              >
                  <div className="absolute inset-0 rounded-full opacity-10 bg-[url('./ball.svg')] bg-cover mix-blend-multiply"></div>
                  <div className="text-sm sm:text-xl md:text-2xl font-black text-black leading-tight text-center z-10" style={{ fontFamily: "Luckiest Guy" }}>
                    WHOLE<br/>NUMBERS
                  </div>
              </button>

              <button
                onClick={() => setSelectedNumberType('integer')}
                className={`group relative w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-full bg-white flex flex-col items-center justify-center shadow-[0_8px_0_rgba(0,0,0,0.2)] transition-all active:translate-y-1 active:shadow-none hover:scale-105 ${selectedNumberType === 'integer' ? 'ring-4 ring-yellow-400 ring-offset-4 ring-offset-transparent scale-110' : ''}`}
              >
                  <div className="absolute inset-0 rounded-full opacity-10 bg-[url('/ball.svg')] bg-cover mix-blend-multiply"></div>
                  <div className="text-sm sm:text-xl md:text-2xl font-black text-black leading-tight text-center z-10" style={{ fontFamily: "Luckiest Guy" }}>
                    INTEGERS
                  </div>
              </button>
           </div>

           {/* Play Button */}
           <div className="flex flex-col items-center gap-2 pb-8">
              <div className="text-white font-black text-lg sm:text-xl tracking-widest" style={{ fontFamily: "Luckiest Guy", textShadow: "2px 2px 0 #000" }}>
                PLAY
              </div>
              <button
                onClick={startMatch}
                className="w-12 h-12 sm:w-16 sm:h-16 bg-white rounded-full flex items-center justify-center shadow-[0_4px_0_rgba(0,0,0,0.3)] hover:scale-110 active:scale-95 active:translate-y-1 transition-all"
              >
                 <Play className="w-8 h-8 sm:w-10 sm:h-10 text-red-600 fill-red-600 ml-1" />
              </button>
           </div>
           
           </div>
        </div>
      )}

      {/* Start Menu */}
      {gameState === 'menu' && !showHelp && (
        <div className="absolute inset-0 z-[70] flex flex-col items-center justify-center bg-black/10 backdrop-blur-[2px] animate-in fade-in duration-500 overflow-y-auto">
           
           {/* Title */}
           <div className="mb-4 md:mb-8 transform hover:scale-105 transition-transform duration-500 w-full px-4">
              <div
                style={{
                  color: "#fff",
                  fontFamily: 'Luckiest Guy',
                  lineHeight: "1",
                  textTransform: "uppercase",
                  textShadow: "0px 4px 0 #059669, 0px 6px 0 #000",
                  WebkitTextStroke: "1px #059669"
                }}
                className="drop-shadow-2xl text-center tracking-wider text-5xl sm:text-7xl md:text-8xl lg:text-9xl"
              >
                SPOT KICKER
              </div>
           </div>

           {/* Center Section: Character + Button */}
           <div className="relative flex items-center justify-center w-full h-48 sm:h-64 mb-4 md:mb-8">
              {/* Start Button - Centered */}
              <button
                onClick={startGame}
                className="group relative z-20 w-32 h-40 sm:w-48 sm:h-56 transition-all active:translate-y-2 active:shadow-none hover:scale-105"
              >
                <img 
                    src="/Group-9.svg" 
                    alt="Start Game" 
                    className="w-full h-full object-contain drop-shadow-[0_15px_20px_rgba(0,0,0,0.4)]" 
                />
              </button>

              {/* Character - Positioned to the left of the button */}
              <div className="absolute right-[calc(50%+4rem)] sm:right-[calc(50%+6rem)] md:right-[calc(50%+7rem)] w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 animate-bounce-slow z-10">
                 <img 
                   src="/Property 1=3.svg" 
                   alt="Kicker" 
                   className="w-full h-full object-contain" 
                 />
              </div>
           </div>

           {/* How to Play Section */}
           <div className="flex flex-col items-center gap-2 max-w-2xl px-4 text-center">
              <div 
                className="text-xl sm:text-2xl md:text-3xl text-red-600 font-black tracking-wider cursor-pointer hover:scale-105 transition-transform"
                style={{ 
                  fontFamily: "Luckiest Guy", 
                  textShadow: "2px 2px 0 #fff, -2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff" 
                }}
                onClick={openHelp}
              >
                HOW TO PLAY ?
              </div>
              <div 
                className="text-sm sm:text-lg md:text-xl text-white font-black tracking-wide leading-tight"
                style={{ 
                  fontFamily: "Nunito", 
                  textShadow: "2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000" 
                }}
              >
                SOLVE THE MATH PROBLEM AND KICK THE BALL INTO THE GOAL WITH THE CORRECT ANSWER.
              </div>
           </div>
           
        </div>
      )}

      {/* Help / Start Overlay */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[80]">
          <div className="bg-white rounded-xl p-6 sm:p-8 max-w-md w-11/12 text-black relative shadow-2xl border-4 border-green-500">
            <button
              onClick={() => closeHelp(false)}
              className="absolute top-3 right-3 p-2 rounded-full bg-gray-200 hover:bg-gray-300"
              aria-label="Close help"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-3xl font-bold mb-4 text-center text-green-700" style={{ fontFamily: "Luckiest Guy" }}>How to Play</h2>
            <div className="space-y-4 text-lg font-medium text-gray-700" style={{ fontFamily: "Nunito" }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold">1</div>
                <p>Solve the math problem to identify the correct goal answer.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold">2</div>
                <p>Hold the Spacebar to charge your kick power (green=close, yellow=mid, red=far).</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold">3</div>
                <p>Release the Spacebar to kick the ball to the targeted goal and score points!</p>
              </div>
            </div>
            <div className="mt-8 flex items-center justify-center">
              <button
                onClick={() => closeHelp(true)}
                className="px-8 py-3 rounded-full bg-green-500 hover:bg-green-600 text-white font-bold text-xl shadow-lg transition-transform hover:scale-105 active:scale-95"
                style={{ fontFamily: "Luckiest Guy" }}
              >
                PLAY BALL!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Score Menu (Game Over) */}
      {gameState === 'finished' && (
        <div className="absolute inset-0 z-[70] flex flex-col items-center justify-start pt-8 animate-in fade-in duration-500 overflow-y-auto">
           {/* Background Image (Same as game) */}
           <div className="absolute inset-0 z-0">
             <img 
               src="./Desktop Spot kicker.svg" 
               alt="Soccer Field Background" 
               className="w-full h-full object-cover"
             />
           </div>
           
           {/* Content Container - Relative to sit above background */}
           <div className="relative z-10 w-full h-full flex flex-col items-center justify-start pt-8 md:pt-16">
           
           {/* Header */}
           <div className="mb-4 md:mb-6 text-center px-4 w-full">
              <div
                style={{
                  color: "#fff",
                  fontFamily: 'Luckiest Guy',
                  lineHeight: "1.2",
                  textTransform: "uppercase",
                  textShadow: "0px 4px 0 #059669, 0px 6px 0 #000",
                  WebkitTextStroke: "1px #059669"
                }}
                className="drop-shadow-lg tracking-wide text-5xl sm:text-6xl md:text-8xl"
              >
                YOUR SCORE
              </div>
           </div>

           {/* Score Display */}
           <div className="mb-2 md:mb-4 text-center px-4">
              <div
                style={{
                  color: "#fff",
                  fontFamily: 'Luckiest Guy',
                  lineHeight: "1",
                  textShadow: "4px 4px 0 #000"
                }}
                className="drop-shadow-xl text-6xl sm:text-8xl md:text-[8rem]"
              >
                {score * 25}
              </div>
           </div>

           {/* Stats Rows */}
           <div className="flex flex-col items-center gap-1 md:gap-2 mb-8 md:mb-12 w-full">
              <div className="text-white font-black text-2xl sm:text-3xl md:text-4xl tracking-wide drop-shadow-[2px_2px_0_#000]" style={{ fontFamily: "Luckiest Guy" }}>
                TOTAL GOALS : {score}
              </div>
              <div className="text-white font-black text-2xl sm:text-3xl md:text-4xl tracking-wide drop-shadow-[2px_2px_0_#000]" style={{ fontFamily: "Luckiest Guy" }}>
                MISSES : {misses}
              </div>
           </div>

           {/* Buttons */}
           <div className="flex flex-col items-center gap-6 pb-8">
              {/* Play Again Button */}
              <button
                onClick={resetRound}
                className="group relative w-32 h-32 md:w-40 md:h-40 rounded-full bg-white flex flex-col items-center justify-center shadow-[0_8px_0_rgba(0,0,0,0.2)] transition-all active:translate-y-1 active:shadow-none hover:scale-105"
              >
                  <div className="absolute inset-0 rounded-full opacity-10 bg-[url('/ball.svg')] bg-cover mix-blend-multiply"></div>
                  <div className="text-xl md:text-2xl font-black text-black leading-tight text-center z-10 flex flex-col items-center gap-1" style={{ fontFamily: "Luckiest Guy" }}>
                    PLAY<br/>AGAIN
                    <RotateCcw className="w-6 h-6 md:w-8 md:h-8 text-black" />
                  </div>
              </button>

              {/* Main Menu Button */}
              <button
                onClick={() => setGameState('menu')}
                className="absolute bottom-8 right-8 group flex flex-col items-center hover:scale-105 transition-transform"
              >
                  <div className="w-12 h-12 md:w-16 md:h-16 relative">
                     <div className="absolute inset-0 bg-red-600 rounded-b-2xl rounded-t-sm border-2 border-black shadow-[0_4px_0_#000]"></div>
                  </div>
                  <div className="text-white font-black text-sm md:text-base mt-1 drop-shadow-md" style={{ fontFamily: "Luckiest Guy", textShadow: "1px 1px 0 #000" }}>
                    MAIN MENU
                  </div>
              </button>
           </div>
           
           {/* Character - Positioned to the left */}
           <div className="absolute left-[5%] md:left-[15%] top-1/2 transform -translate-y-1/2 w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 hidden sm:block">
              <img 
                src="/boy.svg" 
                alt="Kicker" 
                className="w-full h-full object-contain" 
              />
           </div>

           </div>
        </div>
      )}
    </div>
  )
}
