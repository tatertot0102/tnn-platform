import { GripVertical } from 'lucide-react'

// A real button so keyboard users can pick an item up with Space/Enter and move
// it with the arrow keys (dnd-kit KeyboardSensor).
export default function DragHandle({ attributes, listeners, label, disabled }) {
  if (disabled) return <span className="w-6 flex-shrink-0" aria-hidden="true" />
  return (
    <button type="button" {...attributes} {...listeners} aria-label={label}
      className="w-6 h-8 -ml-1 flex items-center justify-center rounded-md cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-300 focus-visible:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 flex-shrink-0 touch-none">
      <GripVertical size={14} aria-hidden="true" />
    </button>
  )
}
