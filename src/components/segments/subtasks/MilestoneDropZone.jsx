import { useDroppable } from '@dnd-kit/core'

export default function MilestoneDropZone({ id, children, isOver }) {
  const { setNodeRef } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={`min-h-8 rounded-lg transition-colors duration-fast ${isOver ? 'bg-brand-600/10 ring-1 ring-brand-500/40' : ''}`}>
      {children}
    </div>
  )
}
