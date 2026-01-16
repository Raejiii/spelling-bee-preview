import { useState, useEffect, useRef } from 'react'
import { Pause, HelpCircle, RotateCcw, Play, VolumeX, Music } from 'lucide-react'
import confetti from 'canvas-confetti'
import { cn } from '../lib/utils'

// --- Types ---

interface Point {
  x: number
  y: number
}

interface Piece {
  id: number
  type?: string // 'triangle', 'square', etc. for interchangeability
  path: string // SVG path data (relative to 0,0 being center of piece)
  width: number
  height: number
  solution: { x: number; y: number; rotation: number } // Target position (relative to board center)
  initial: { x: number; y: number; rotation: number } // Initial position (relative to board center)
  validRotations?: number[] // Additional valid rotations (e.g. [0, 180] for symmetry)
}

interface Level {
  id: number
  pieces: Piece[]
  boardSize: { width: number; height: number }
}

// --- Level Data ---

const LEVEL_1: Level = {
  id: 1,
  boardSize: { width: 400, height: 500 },
  pieces: [
    // 1. Bottom Rectangle (Base)
    {
      id: 1,
      type: 'rect',
      // Rect 50x150. Symmetrical at 0 and 180.
      path: "M -25 -75 L 25 -75 L 25 75 L -25 75 Z",
      width: 50,
      height: 150,
      solution: { x: 0, y: 50, rotation: 0 },
      initial: { x: 200, y: 150, rotation: 90 },
      validRotations: [0, 180]
    },
    // 2. Parallelogram (Angled arm)
    {
      id: 2,
      type: 'parallelogram',
      // Symmetrical at 0 and 180? Yes.
      path: "M -25 25 L 25 25 L 75 -25 L 25 -25 Z",
      width: 100,
      height: 50,
      solution: { x: 25, y: -50, rotation: 0 },
      initial: { x: 200, y: 50, rotation: 45 },
      validRotations: [0, 180]
    },
    // 3. Middle Triangle (Corner filler)
    {
      id: 3,
      type: 'small-triangle',
      // Isosceles Right Triangle? 
      // Vertices: (-25, 25), (25, 25), (-25, -25).
      // Not symmetrical rotationally in 2D without flip.
      path: "M -25 25 L 25 25 L -25 -25 Z",
      width: 50,
      height: 50,
      solution: { x: 0, y: -50, rotation: 0 }, 
      initial: { x: 200, y: -50, rotation: 0 }
    },
    // 4. Top Triangle (Tip)
    {
      id: 4,
      type: 'small-triangle',
      // Same shape as piece 3.
      path: "M -25 25 L 25 25 L -25 -25 Z",
      width: 50,
      height: 50,
      solution: { x: 75, y: -75, rotation: 180 },
      initial: { x: 200, y: -120, rotation: 180 }
    }
  ]
}

const LEVELS = [LEVEL_1]

// --- Component ---

export default function TangramGame() {
  const [currentLevelIdx] = useState(0)
  const level = LEVELS[currentLevelIdx]
  
  // State for pieces: current x, y, rotation, isPlaced
  const [pieceStates, setPieceStates] = useState<Record<number, { x: number; y: number; rotation: number; isPlaced: boolean; isFlipped: boolean }>>({})
  
  // Game State
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'completed'>('menu')
  const [timeLeft, setTimeLeft] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [activePieceId, setActivePieceId] = useState<number | null>(null) // For showing rotation handles
  const [draggedPieceId, setDragPieceId] = useState<number | null>(null)
  const [interactionMode, setInteractionMode] = useState<'move' | 'rotate' | null>(null)
  
  // Responsive Scale
  const [scale, setScale] = useState(1)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Refs for drag logic
  const dragStartPos = useRef<Point>({ x: 0, y: 0 }) // Mouse/Touch pos on screen
  const pieceStartPos = useRef<Point>({ x: 0, y: 0 }) // Piece pos relative to board center
  const initialRotation = useRef<number>(0) // Initial rotation when starting rotate drag
  const boardRef = useRef<HTMLDivElement>(null)
  const clickStartTime = useRef<number>(0)

  // Initialize Level
  useEffect(() => {
    initializePieces()
  }, [currentLevelIdx])

  // Handle Resize
  useEffect(() => {
      const updateScale = () => {
          if (!wrapperRef.current) return
          const { width, height } = wrapperRef.current.getBoundingClientRect()
          // Target board size with some padding (400x500 base)
          // Add padding for comfort
          const padding = 20
          const targetW = level.boardSize.width + padding * 2
          const targetH = level.boardSize.height + padding * 2
          
          const scaleW = width / targetW
          const scaleH = height / targetH
          
          // Fit containment
          const s = Math.min(scaleW, scaleH, 1.2) // Cap at 1.2 to avoid getting too huge on desktops
          setScale(s)
      }
      
      updateScale()
      window.addEventListener('resize', updateScale)
      return () => window.removeEventListener('resize', updateScale)
  }, [level.boardSize])

  // Responsive Scale for Menu
  const [menuScale, setMenuScale] = useState(1)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (gameState !== 'menu') return
    const updateMenuScale = () => {
        if (!menuRef.current) return
        const { width, height } = window.getComputedStyle(menuRef.current.parentElement!) // Use parent (screen) size
        const w = parseFloat(width)
        const h = parseFloat(height)
        
        // Target menu size: ~800x600 safe area
        const targetW = 800
        const targetH = 600
        
        const sW = w / targetW
        const sH = h / targetH
        
        // Fit
        const s = Math.min(sW, sH, 1)
        setMenuScale(s)
    }
    updateMenuScale()
    window.addEventListener('resize', updateMenuScale)
    return () => window.removeEventListener('resize', updateMenuScale)
  }, [gameState])

  // Timer
  useEffect(() => {
    if (isPaused || gameState !== 'playing') return
    const timer = setInterval(() => setTimeLeft(t => t + 1), 1000)
    return () => clearInterval(timer)
  }, [isPaused, gameState])

  const initializePieces = () => {
    const initialStates: Record<number, { x: number; y: number; rotation: number; isPlaced: boolean; isFlipped: boolean }> = {}
    level.pieces.forEach(p => {
      initialStates[p.id] = {
        x: p.initial.x,
        y: p.initial.y,
        rotation: p.initial.rotation,
        isPlaced: false,
        isFlipped: false
      }
    })
    setPieceStates(initialStates)
  }

  const resetLevel = () => {
    initializePieces()
    setGameState('playing')
    setTimeLeft(0)
    setIsPaused(false)
    setShowSidebar(false)
  }

  // --- Drag & Drop Logic ---

  const handlePointerDown = (e: React.PointerEvent, pieceId: number) => {
    if (gameState !== 'playing' || isPaused) return
    
    // If placed, do not allow interaction (Locked)
    if (pieceStates[pieceId]?.isPlaced) return

    e.preventDefault()
    e.stopPropagation()
    
    // Determine if we clicked the Rotate Handle or the Body
    // We will render a specific rotate handle element.
    const target = e.target as HTMLElement
    const isRotateHandle = target.classList.contains('rotate-handle')
    
    // Capture pointer for consistent tracking
    if (target.setPointerCapture) {
        target.setPointerCapture(e.pointerId)
    }
    
    const pieceState = pieceStates[pieceId]
    setActivePieceId(pieceId) // Set active for showing handles
    setDragPieceId(pieceId)
    setInteractionMode(isRotateHandle ? 'rotate' : 'move')
    
    dragStartPos.current = { x: e.clientX, y: e.clientY }
    pieceStartPos.current = { x: pieceState.x, y: pieceState.y }
    initialRotation.current = pieceState.rotation
    clickStartTime.current = Date.now()
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggedPieceId || isPaused) return
    e.preventDefault()
    
    // Adjust dx/dy by scale
    const dx = (e.clientX - dragStartPos.current.x) / scale
    const dy = (e.clientY - dragStartPos.current.y) / scale
    
    if (interactionMode === 'move') {
        // Move Logic
        setPieceStates(prev => ({
          ...prev,
          [draggedPieceId]: {
            ...prev[draggedPieceId],
            x: pieceStartPos.current.x + dx,
            y: pieceStartPos.current.y + dy,
            isPlaced: false
          }
        }))
    } else if (interactionMode === 'rotate') {
        // Rotate Logic
        // Calculate angle relative to piece center
        // Piece center on screen:
        // We know pieceStartPos (relative to board center). 
        // We need board center relative to screen.
        if (!boardRef.current) return
        
        const boardRect = boardRef.current.getBoundingClientRect()
        const boardCenterX = boardRect.left + boardRect.width / 2
        const boardCenterY = boardRect.top + boardRect.height / 2
        
        // Piece current center on screen
        // pieceStartPos is in game units. We must scale it to get screen offset.
        const pieceScreenX = boardCenterX + pieceStartPos.current.x * scale
        const pieceScreenY = boardCenterY + pieceStartPos.current.y * scale
        
        // Current mouse angle relative to piece center
        const angleRad = Math.atan2(e.clientY - pieceScreenY, e.clientX - pieceScreenX)
        const angleDeg = angleRad * (180 / Math.PI)
        
        // Initial mouse angle relative to piece center
        const startAngleRad = Math.atan2(dragStartPos.current.y - pieceScreenY, dragStartPos.current.x - pieceScreenX)
        const startAngleDeg = startAngleRad * (180 / Math.PI)
        
        const deltaAngle = angleDeg - startAngleDeg
        
        setPieceStates(prev => ({
            ...prev,
            [draggedPieceId]: {
                ...prev[draggedPieceId],
                rotation: (initialRotation.current + deltaAngle + 360) % 360,
                isPlaced: false
            }
        }))
    }
  }

  const handlePointerUp = () => {
    if (draggedPieceId) {
        checkSnap(draggedPieceId)
        setDragPieceId(null)
        setInteractionMode(null)
    }
    // Note: We do NOT clear activePieceId here, so the selection box stays visible until you click elsewhere.
  }
  
  // Clear selection when clicking background
  const handleBackgroundClick = () => {
      if (!draggedPieceId) {
          setActivePieceId(null)
      }
  }

  const handleDoubleClick = (e: React.MouseEvent, pieceId: number) => {
      e.stopPropagation()
      if (gameState !== 'playing' || isPaused) return
      if (pieceStates[pieceId]?.isPlaced) return
      
      setPieceStates(prev => ({
          ...prev,
          [pieceId]: {
              ...prev[pieceId],
              isFlipped: !prev[pieceId].isFlipped,
              isPlaced: false
          }
      }))
      
      // Check snap after flip
      setTimeout(() => checkSnap(pieceId), 50)
  }

  const checkSnap = (id: number) => {
    const currentState = pieceStates[id]
    
    // Find ALL potential targets that match this piece's type (or ID if no type)
    // This allows interchangeable pieces (like 2 identical triangles) to snap to EITHER spot.
    const currentPieceDef = level.pieces.find(p => p.id === id)
    if (!currentPieceDef) return

    const potentialTargets = level.pieces.filter(p => {
        // If types are defined and match, it's a valid target.
        if (currentPieceDef.type && p.type === currentPieceDef.type) return true
        // Otherwise, fallback to strict ID matching
        return p.id === id
    })

    // Thresholds
    const DIST_THRESHOLD = 60 
    const ROT_THRESHOLD = 25 

    // Check against all potential targets
    for (const targetPiece of potentialTargets) {
        // Skip if this target is already filled by ANOTHER piece (unless it's the current one)
        // Actually, logic is: Is there a "solution" slot available?
        // We need to check if we are close to targetPiece.solution
        
        const target = targetPiece.solution
        
        const dist = Math.sqrt(
          Math.pow(currentState.x - target.x, 2) + 
          Math.pow(currentState.y - target.y, 2)
        )
        
        // Check Rotation
        // We need to check against the target rotation AND any valid symmetries.
        // Base valid rotations for the piece itself (e.g. 0, 180 for rect)
        // PLUS the target rotation offset.
        // Actually, simpler: 
        // Target rotation is T.
        // Piece can be at T, T+180, etc.
        
        const validOffsets = currentPieceDef.validRotations || [0]
        let isRotationValid = false
        
        for (const offset of validOffsets) {
            // Target rotation + offset
            const targetRotWithOffset = (target.rotation + offset) % 360
            
            let rotDiff = Math.abs(currentState.rotation - targetRotWithOffset) % 360
            if (rotDiff > 180) rotDiff = 360 - rotDiff
            
            if (rotDiff < ROT_THRESHOLD) {
                isRotationValid = true
                break
            }
        }

        if (dist < DIST_THRESHOLD && isRotationValid) {
             // SNAP!
             // We need to snap to the TARGET's location and rotation.
             // But which rotation? The one we matched closest to.
             
             // Recalculate best snap rotation
             let bestSnapRotation = target.rotation
             let minDiff = 360
             
             for (const offset of validOffsets) {
                 const targetRotWithOffset = (target.rotation + offset) % 360
                 let rotDiff = Math.abs(currentState.rotation - targetRotWithOffset) % 360
                 if (rotDiff > 180) rotDiff = 360 - rotDiff
                 
                 if (rotDiff < minDiff) {
                     minDiff = rotDiff
                     bestSnapRotation = targetRotWithOffset
                 }
             }

             setPieceStates(prev => ({
                ...prev,
                [id]: {
                  ...prev[id],
                  x: target.x,
                  y: target.y,
                  rotation: bestSnapRotation,
                  isPlaced: true
                }
             }))
             return // Stop checking other targets once snapped
        }
    }
  }

  // Check Win Condition
  useEffect(() => {
    if (gameState !== 'playing') return
    
    const allPlaced = level.pieces.every(p => pieceStates[p.id]?.isPlaced)
    if (allPlaced) {
      // Double check rotation logic?
      // Actually isPlaced is only set if rotation matched.
      // So we are good.
      setGameState('completed')
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 }
      })
    }
  }, [pieceStates, gameState, level.pieces])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const togglePause = () => {
    setIsPaused((p) => {
      const next = !p
      setShowSidebar(next)
      return next
    })
  }

  const toggleMute = () => {
    setIsMuted((m) => !m)
  }

  return (
    <div 
      className="relative w-full h-full overflow-hidden select-none font-sans flex flex-col bg-[#d4e198]"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerDown={handleBackgroundClick}
      style={{
        // Background pattern
        backgroundImage: 'url("/Tangram Puzzles.svg")',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
        {/* --- Menu Screen --- */}
        {gameState === 'menu' && (
            <div className="absolute inset-0 z-[100] flex items-center justify-center bg-[#d4e198]" style={{
                backgroundImage: 'url("/Tangram Puzzles.svg")',
                backgroundSize: 'cover',
                backgroundPosition: 'center'
            }}>
                <div 
                    ref={menuRef}
                    className="flex flex-col items-center justify-center p-4 text-center"
                    style={{
                        transform: `scale(${menuScale})`,
                        width: '800px', // Fixed base size for scaling
                        height: '600px',
                    }}
                >
                    {/* Logo / Title */}
                    <div className="mb-8 relative transform hover:scale-105 transition-transform duration-300">
                        <h1 
                            className="text-8xl font-black text-[#facc15]"
                            style={{ 
                                fontFamily: '"Black Han Sans", system-ui',
                                textShadow: '4px 4px 0 #881337, -2px -2px 0 #881337, 2px -2px 0 #881337, -2px 2px 0 #881337',
                                WebkitTextStroke: '2px #881337',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            TANGRAM<br/>PUZZLES
                        </h1>
                    </div>

                    {/* Play Button */}
                    <button
                        onClick={() => setGameState('playing')}
                        className="mb-12 group relative px-12 py-4 bg-gradient-to-b from-[#facc15] to-[#ca8a04] rounded-2xl shadow-[0_6px_0_#854d0e] active:shadow-none active:translate-y-2 transition-all"
                    >
                        <div className="flex items-center gap-4 text-white font-black text-4xl" style={{ fontFamily: '"Black Han Sans", system-ui', textShadow: '2px 2px 0 #854d0e' }}>
                            PLAY <Play fill="white" size={32} />
                        </div>
                    </button>

                    {/* Instructions */}
                    <div className="grid grid-cols-3 gap-8 w-full">
                        {/* Instruction 1: Move */}
                        <div className="flex flex-col items-center gap-4">
                            <div className="h-24 flex items-center justify-center">
                                {/* Visual Representation */}
                                <svg width="100" height="60" viewBox="0 0 100 60" style={{ overflow: 'visible' }}>
                                    <path d="M 0 60 L 100 60 L 0 0 Z" fill="#881337" stroke="#4c0519" strokeWidth="2" />
                                    <circle cx="30" cy="40" r="8" fill="#f59e0b" stroke="#b45309" strokeWidth="1" />
                                    {/* Hand Icon */}
                                    <image href="https://lucide.dev/icons/hand" x="30" y="40" width="24" height="24" />
                                </svg>
                            </div>
                            <p className="font-black text-[#4c0519] text-xl leading-tight" style={{ fontFamily: '"Black Han Sans", system-ui' }}>
                                drag the dot<br/>to move a tile
                            </p>
                        </div>

                        {/* Instruction 2: Rotate */}
                        <div className="flex flex-col items-center gap-4">
                            <div className="h-24 flex items-center justify-center relative">
                                 <svg width="100" height="60" viewBox="0 0 100 60" style={{ overflow: 'visible' }}>
                                    <g transform="rotate(15, 30, 40)">
                                        <path d="M 0 60 L 100 60 L 0 0 Z" fill="#881337" stroke="#4c0519" strokeWidth="2" />
                                        <circle cx="30" cy="40" r="8" fill="#f59e0b" stroke="#b45309" strokeWidth="1" />
                                    </g>
                                    {/* Rotation Arrow */}
                                    <path d="M 60 70 Q 80 70 90 50" fill="none" stroke="black" strokeWidth="3" markerEnd="url(#arrowhead)" />
                                </svg>
                            </div>
                            <p className="font-black text-[#4c0519] text-xl leading-tight" style={{ fontFamily: '"Black Han Sans", system-ui' }}>
                                Drag around<br/>the dot to<br/>rotate a tile
                            </p>
                        </div>

                        {/* Instruction 3: Flip */}
                        <div className="flex flex-col items-center gap-4">
                            <div className="h-24 flex items-center justify-center">
                                 <svg width="100" height="60" viewBox="0 0 100 60" style={{ overflow: 'visible' }}>
                                    <path d="M 0 60 L 100 60 L 0 0 Z" fill="#881337" stroke="#4c0519" strokeWidth="2" />
                                    <circle cx="30" cy="40" r="8" fill="#f59e0b" stroke="#b45309" strokeWidth="1" />
                                    {/* Flip Arrow (through dot) */}
                                    <line x1="10" y1="40" x2="90" y2="40" stroke="black" strokeWidth="3" markerEnd="url(#arrowhead)" />
                                </svg>
                            </div>
                            <p className="font-black text-[#4c0519] text-xl leading-tight" style={{ fontFamily: '"Black Han Sans", system-ui' }}>
                                Double click<br/>to flip<br/>a tile
                            </p>
                        </div>
                    </div>
                    
                    {/* SVG Definitions for Arrows */}
                    <svg style={{ position: 'absolute', width: 0, height: 0 }}>
                        <defs>
                            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="black" />
                            </marker>
                        </defs>
                    </svg>
                </div>
            </div>
        )}

        {/* --- Header --- */}
        <button
          className="fixed top-4 right-4 z-[60] w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center transition-colors shadow-lg"
          aria-label="Help"
        >
          <HelpCircle className="w-6 h-6 sm:w-8 sm:h-8 lg:w-12 lg:h-12 text-white" />
        </button>

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
                onClick={resetLevel}
                className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-full bg-yellow-500 hover:bg-yellow-600 flex items-center justify-center transition-colors shadow-lg"
                aria-label="Reset round"
              >
                <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6 lg:w-10 lg:h-10 text-white" />
              </button>
            </>
          )}
        </div>
      </div>

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
              TANGRAM PUZZLE
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
                {formatTime(timeLeft)}
              </span>
            </div>
          </div>
        </div>
      </div>

        {/* --- Main Game Area --- */}
        <div className="flex-1 flex items-center justify-center relative z-10 w-full h-full p-4 overflow-hidden" ref={wrapperRef}>
            
            {/* Center Board (Bamboo Frame) */}
            <div 
                ref={boardRef}
                className="relative bg-[#fefce8] shadow-2xl flex items-center justify-center origin-center"
                style={{
                    width: level.boardSize.width,
                    height: level.boardSize.height,
                    transform: `scale(${scale})`,
                    // Bamboo Frame Simulation
                    border: '12px solid #859f3d',
                    outline: '4px dashed #556b2f',
                    outlineOffset: '-8px',
                    borderRadius: '4px'
                }}
            >
                {/* Bamboo Joints (Visual Decoration corners) */}
                <div className="absolute -top-4 -left-4 w-8 h-8 bg-[#556b2f] rounded-full z-20" />
                <div className="absolute -top-4 -right-4 w-8 h-8 bg-[#556b2f] rounded-full z-20" />
                <div className="absolute -bottom-4 -left-4 w-8 h-8 bg-[#556b2f] rounded-full z-20" />
                <div className="absolute -bottom-4 -right-4 w-8 h-8 bg-[#556b2f] rounded-full z-20" />

                {/* Level Indicator (Paper Clip style) */}
                <div className="absolute -top-6 left-8 bg-[#fde047] px-4 py-1 rounded shadow-md transform -rotate-2 z-30 border-2 border-orange-700">
                    <span className="text-orange-900 font-black text-xl" style={{ fontFamily: '"Black Han Sans", system-ui' }}>
                        LEVEL {level.id}
                    </span>
                </div>

                {/* Target Silhouette (The Hole) */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    {level.pieces.map(p => (
                        <div 
                            key={`target-${p.id}`}
                            className="absolute"
                            style={{
                                transform: `translate(${p.solution.x}px, ${p.solution.y}px) rotate(${p.solution.rotation}deg)`,
                                width: 0, height: 0
                            }}
                        >
                            <svg 
                                width="200" height="200" 
                                viewBox="-100 -100 200 200" 
                                style={{ overflow: 'visible', transform: 'translate(-50%, -50%)' }}
                            >
                                <path 
                                    d={p.path} 
                                    fill="#FFFFFF" // White silhouette
                                    stroke="#333333" // Dark outline
                                    strokeWidth="2"
                                />
                            </svg>
                        </div>
                    ))}
                </div>

                {/* Pieces Layer */}
                {/* We render ALL pieces here, but their coordinates determine if they are 'on board' or 'on side' visually. 
                    Actually, our state tracks x/y relative to board center. 
                    Initial positions are large X values (off to the right). 
                */}
                <div className="absolute inset-0 flex items-center justify-center">
                    {level.pieces.map(p => {
                        const state = pieceStates[p.id] || { x: 0, y: 0, rotation: 0, isPlaced: false }
                        const isDragging = draggedPieceId === p.id
                        const isActive = activePieceId === p.id
                        
                        return (
                            <div
                                key={p.id}
                                className={cn(
                                    "absolute transition-transform pointer-events-none", // Container ignores events
                                    isDragging ? "z-50" : (isActive ? "z-45" : "z-40"),
                                    // If dragging, disable transition for smooth follow
                                    isDragging ? "duration-0" : "duration-200 ease-out" 
                                )}
                                style={{
                                    transform: `translate(${state.x}px, ${state.y}px) rotate(${state.rotation}deg)`,
                                    touchAction: 'none'
                                }}
                            >
                                <svg 
                                    width="200" height="200" 
                                    viewBox="-100 -100 200 200" 
                                    style={{ 
                                        overflow: 'visible',
                                        filter: isDragging ? 'drop-shadow(0px 10px 10px rgba(0,0,0,0.3))' : 'drop-shadow(0px 2px 2px rgba(0,0,0,0.2))'
                                    }}
                                >
                                    {/* Selection Box / Rotate Handles (Photoshop Style) */}
                                    {isActive && !state.isPlaced && (
                                        <g>
                                            {/* Bounding Box Outline */}
                                            <rect 
                                                x={-p.width/2 - 5} 
                                                y={-p.height/2 - 5} 
                                                width={p.width + 10} 
                                                height={p.height + 10} 
                                                fill="none" 
                                                stroke="#3b82f6" 
                                                strokeWidth="1.5"
                                                strokeDasharray="4 2"
                                                className="pointer-events-none"
                                            />
                                            {/* Rotate Handle (Top Center stem) */}
                                            <line 
                                                x1="0" y1={-p.height/2 - 5} 
                                                x2="0" y2={-p.height/2 - 25} 
                                                stroke="#3b82f6" 
                                                strokeWidth="1.5" 
                                            />
                                            <circle 
                                                cx="0" cy={-p.height/2 - 25} 
                                                r="6" 
                                                fill="#ffffff" 
                                                stroke="#3b82f6" 
                                                strokeWidth="2"
                                                className="rotate-handle cursor-[url('https://lucide.dev/icons/rotate-cw'),_auto] pointer-events-auto hover:scale-125 transition-transform"
                                                onPointerDown={(e) => handlePointerDown(e, p.id)}
                                            />
                                        </g>
                                    )}

                                    <path 
                                        d={p.path} 
                                        fill="#881337" // Burgundy
                                        stroke="#4c0519"
                                        strokeWidth="2"
                                        className={cn(
                                            "cursor-pointer pointer-events-auto",
                                            state.isPlaced ? "cursor-default" : ""
                                        )} // Path captures events
                                        onPointerDown={(e) => handlePointerDown(e, p.id)}
                                        onDoubleClick={(e) => handleDoubleClick(e, p.id)}
                                        transform={state.isFlipped ? "scale(-1, 1)" : ""}
                                    />
                                    {/* Center Dot - purely visual now, or for dragging if preferred */}
                                    {!state.isPlaced && (
                                        <circle cx="0" cy="0" r="4" fill="#f59e0b" stroke="#b45309" strokeWidth="1" className="pointer-events-none" />
                                    )}
                                </svg>
                            </div>
                        )
                    })}
                </div>

                {/* Finish Button (Always visible but active only when done? Or just for show?) 
                    The image has a 'FINISH' button. Maybe it appears when done.
                */}
                {gameState === 'completed' && (
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 animate-bounce">
                        <button 
                            onClick={() => {
                                // Next level logic or restart
                                resetLevel()
                            }}
                            className="bg-[#fde047] text-orange-900 border-b-4 border-orange-700 px-8 py-2 rounded-xl font-black text-2xl shadow-lg active:border-b-0 active:translate-y-1"
                            style={{ fontFamily: '"Black Han Sans", system-ui' }}
                        >
                            NEXT LEVEL
                        </button>
                    </div>
                )}
                 {gameState === 'playing' && (
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 opacity-50">
                        <div 
                            className="bg-[#fde047] text-orange-900 border-b-4 border-orange-700 px-8 py-2 rounded-xl font-black text-2xl"
                            style={{ fontFamily: '"Black Han Sans", system-ui' }}
                        >
                            FINISH
                        </div>
                    </div>
                )}

            </div>
        </div>


        
        {/* Paused Overlay */}

    </div>
  )
}
