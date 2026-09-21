import { useState } from 'react'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ChevronDown, Flag, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import MilestoneDropZone from './MilestoneDropZone'

/** "Add a subtask" field with the add-gate button beside it. */
export function AddItemBar({ placeholder, onAddSubtask, onAddGate, compact = false }) {
  const [value, setValue] = useState('')
  function submit() {
    if (!value.trim()) return
    onAddSubtask(value.trim())
    setValue('')
  }
  return (
    <form className="flex gap-2 mt-3" onSubmit={e => { e.preventDefault(); submit() }}>
      <input className={`input flex-1 ${compact ? 'py-1.5' : ''}`} placeholder={placeholder} aria-label={placeholder}
        value={value} onChange={e => setValue(e.target.value)} enterKeyHint="done" />
      <button type="submit" className="btn-primary flex items-center gap-1.5 px-3" aria-label="Add subtask">
        <Plus size={15} aria-hidden="true" /> <span className="hidden sm:inline">Add</span>
      </button>
      <button type="button" className="btn-ghost px-3 border border-gray-700" title="Add approval gate"
        aria-label="Add approval gate" onClick={onAddGate}>
        <ShieldCheck size={15} className="text-brand-400" aria-hidden="true" />
      </button>
    </form>
  )
}

export default function MilestoneBlock({
  milestone, items, renderRow, onDeleteMilestone, onRename, onAddSubtask, onAddGate,
  canEdit, isExec, isOver, filtered, allTasks,
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleVal, setTitleVal] = useState(milestone.title)

  // Progress always counts the whole milestone, even while a filter hides rows.
  const tasks = allTasks ?? items.filter(i => i.kind === 'subtask')
  const total = tasks.length
  const completed = tasks.filter(t => t.completed).length
  const allDone = total > 0 && completed === total
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  const bodyId = `milestone-body-${milestone.id}`

  function handleRename() {
    if (titleVal.trim() && titleVal.trim() !== milestone.title) onRename(milestone.id, titleVal.trim())
    setEditingTitle(false)
  }

  return (
    <section aria-label={`Milestone: ${milestone.title}`}
      className={`border rounded-xl mb-3 transition-colors duration-normal ${allDone ? 'border-green-800/60 bg-green-950/10' : isOver ? 'border-brand-400/50 bg-brand-900/20' : 'border-gray-800 bg-gray-900/40'}`}>
      <div className="flex items-center gap-2 px-3 md:px-4 py-2.5">
        <button type="button" onClick={() => setCollapsed(c => !c)}
          aria-expanded={!collapsed} aria-controls={bodyId} aria-label={collapsed ? 'Expand milestone' : 'Collapse milestone'}
          className="p-1.5 -ml-1.5 rounded-md text-gray-500 hover:text-gray-300 flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
          <ChevronDown size={15} aria-hidden="true" className={`transition-transform duration-fast ${collapsed ? '-rotate-90' : ''}`} />
        </button>
        <Flag size={13} aria-hidden="true" className={`flex-shrink-0 ${allDone ? 'text-green-400' : 'text-brand-400'}`} />
        {editingTitle ? (
          <input className="input flex-1 py-1" value={titleVal} aria-label="Milestone name"
            onChange={e => setTitleVal(e.target.value)} onBlur={handleRename}
            onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditingTitle(false) }} autoFocus />
        ) : isExec ? (
          <button type="button" onClick={() => { setTitleVal(milestone.title); setEditingTitle(true) }} title="Rename milestone"
            className={`flex-1 min-w-0 text-left text-sm font-semibold truncate rounded hover:text-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${allDone ? 'text-green-400' : 'text-gray-100'}`}>
            {milestone.title}
          </button>
        ) : (
          <h3 className={`flex-1 min-w-0 text-sm font-semibold truncate ${allDone ? 'text-green-400' : 'text-gray-100'}`}>{milestone.title}</h3>
        )}
        <div className="flex items-center gap-2 flex-shrink-0">
          {total > 0 && (
            <>
              <div className="hidden sm:block w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden" aria-hidden="true">
                <div className={`h-full rounded-full origin-left transition-transform duration-normal ${allDone ? 'bg-green-500' : 'bg-brand-400'}`}
                  style={{ transform: `scaleX(${pct / 100})` }} />
              </div>
              <span className="text-xs text-gray-500 tabular-nums">{completed}/{total}</span>
            </>
          )}
          {allDone && <span className="badge bg-green-900 text-green-400 text-xs">Reached ✓</span>}
          {isExec && (
            <button type="button" onClick={() => onDeleteMilestone(milestone.id)} aria-label={`Delete milestone "${milestone.title}"`}
              className="p-1.5 rounded-md text-gray-600 hover:text-red-400 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
              <Trash2 size={13} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      {!collapsed && (
        <div id={bodyId} className="px-3 md:px-4 pb-3">
          <MilestoneDropZone id={`milestone-${milestone.id}`} isOver={isOver}>
            <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
              {items.length === 0 && (
                <p className="text-xs text-gray-600 py-3 text-center">
                  {filtered ? 'Nothing here matches this filter.' : 'Drop subtasks here or add one below'}
                </p>
              )}
              {items.map(renderRow)}
            </SortableContext>
          </MilestoneDropZone>
          {canEdit && !filtered && (
            <AddItemBar compact placeholder={`Add task to ${milestone.title}...`}
              onAddSubtask={title => onAddSubtask(title, milestone.id)}
              onAddGate={() => onAddGate(milestone.id)} />
          )}
        </div>
      )}
    </section>
  )
}
