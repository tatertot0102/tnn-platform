import { AlertTriangle, RotateCcw } from 'lucide-react'

export default function ErrorState({ message = "Couldn't load this page.", onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="w-10 h-10 rounded-full bg-red-950/60 border border-red-900/60 flex items-center justify-center">
        <AlertTriangle size={18} className="text-red-400" />
      </div>
      <p className="text-sm text-gray-400 max-w-sm">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-ghost text-xs flex items-center gap-1.5 border border-gray-700 px-3 py-1.5">
          <RotateCcw size={12} /> Retry
        </button>
      )}
    </div>
  )
}
