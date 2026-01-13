import { lazy, Suspense } from "react"

// const SoccerMathGame = lazy(() => import("./SoccerMathGame").then((mod) => ({ default: mod.default })))
const BubbleLettersGame = lazy(() => import("./BubbleLettersGame").then((mod) => ({ default: mod.default })))

export default function GameWrapper() {
  return (
    <div className="h-screen w-screen bg-blue-900 overflow-hidden">
      <Suspense fallback={
        <div className="h-screen w-screen flex items-center justify-center bg-blue-900">
          <div className="text-xl text-white">Loading game...</div>
        </div>
      }>
        <BubbleLettersGame />
      </Suspense>
    </div>
  )
}
