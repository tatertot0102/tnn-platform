import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { format } from 'date-fns'
import { Check, Link2, Lock, Pencil, Trash2, CalendarDays, ChevronRight } from 'lucide-react'
import DragHandle from './DragHandle'
import { getSubtaskAssigneeIds, isOverdue } from '../../../lib/subtasks'

function AssigneeChips({ ids, members, max = 3 }) {
  const people = ids.map(id => members.find(m => m.id === id)).filter(Boolean)
  if (!people.length) return <span className="text-xs text-gray-600 italic">Unassigned</span>
  return (
    <span className="flex flex-wrap gap-1 min-w-0">
      {people.slice(0, max).map(p => (
        <span key={p.id} title={p.full_name}
          className="text-xs bg-gray-800 text-gray-300 border border-gray-700 rounded-full px-2 py-0.5 max-w-28 truncate">
          {p.full_name.split(' ')[0]}
        </span>
      ))}
      {people.length > max && <span className="text-xs text-gray-500">+{people.length - max}</span>}
    </span>
  )
}

function AssigneePopover({ taskId, assigneeIds, members, onAssign }) {
  return (
    <details className="relative flex-shrink-0">
      <summary aria-label="Edit assignees"
        className="list-none cursor-pointer p-1.5 rounded-md text-gray-600 hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
        <Pencil size={13} aria-hidden="true" />
      </summary>
      <div className="absolute right-0 top-8 z-30 w-60 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl shadow-black/40 p-2 max-h-72 overflow-y-auto animate-pop-in">
        <p className="text-xs text-gray-500 px-2 pb-1">Assign people</p>
        {members.length === 0 && <p className="text-xs text-gray-600 px-2 py-1">Add people to segment roles first.</p>}
        {members.map(m => {
          const selected = assigneeIds.includes(m.id)
          return (
            <button key={m.id} type="button" onClick={() => onAssign(taskId, m.id)} aria-pressed={selected}
              className={`w-full flex items-center justify-between gap-2 text-left text-xs px-2 py-2 rounded-lg transition-colors duration-fast ${selected ? 'bg-brand-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-gray-100'}`}>
              <span className="truncate">{m.full_name}</span>
              {selected && <Check size={12} className="flex-shrink-0" aria-hidden="true" />}
            </button>
          )
        })}
      </div>
    </details>
  )
}

/**
 * One subtask. On desktop every control is inline; on phones the row is a
 * large tap target that opens the actions sheet (onOpen).
 */
export default function SortableSubtaskRow({
  task, members, canEdit, isExec, profileId, blockedBy, highlighted, isDesktop, dragDisabled,
  onToggle, onAssign, onDateChange, onRename, onDelete, onSubmitClick, onOpen,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, disabled: dragDisabled })
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleVal, setTitleVal] = useState(task.title)

  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }
  const overdue = isOverdue(task.due_date, task.completed)
  const assigneeIds = getSubtaskAssigneeIds(task)
  const canSubmit = isExec || assigneeIds.includes(profileId)
  const locked = !!blockedBy
  const canToggle = canEdit && !locked

  function saveTitle() {
    const next = titleVal.trim()
    setEditingTitle(false)
    if (next && next !== task.title) onRename(task.id, next)
    else setTitleVal(task.title)
  }

  const checkbox = (
    <button type="button" role="checkbox" aria-checked={!!task.completed}
      aria-label={locked ? `${task.title}: blocked until "${blockedBy.title}" is approved` : `Mark "${task.title}" ${task.completed ? 'not done' : 'done'}`}
      onClick={() => canToggle && onToggle(task.id)}
      disabled={!canToggle}
      title={locked ? `Blocked until "${blockedBy.title}" is approved` : undefined}
      className={`w-6 h-6 md:w-5 md:h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-all duration-fast active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${task.completed ? 'bg-green-600 border-green-600' : 'border-gray-600 enabled:hover:border-green-500'} disabled:cursor-default`}>
      {task.completed ? <Check size={12} className="text-white" aria-hidden="true" />
        : locked ? <Lock size={10} className="text-gray-600" aria-hidden="true" /> : null}
    </button>
  )

  const rowClass = `group flex items-center gap-2 border-b border-gray-800/40 last:border-0 rounded-lg transition-colors duration-fast ${locked ? 'opacity-50' : ''} ${highlighted ? 'bg-brand-900/40 ring-1 ring-brand-400/60' : ''}`

  if (!isDesktop) {
    return (
      <div ref={setNodeRef} style={style} id={`subtask-${task.id}`} className={`${rowClass} min-h-14 py-2`}>
        <DragHandle attributes={attributes} listeners={listeners} disabled={dragDisabled || !canEdit}
          label={`Reorder "${task.title}"`} />
        {checkbox}
        <button type="button" onClick={() => onOpen(task)}
          className="flex-1 min-w-0 text-left flex items-center gap-2 py-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
          <span className="flex-1 min-w-0">
            <span className={`block text-[15px] leading-snug ${task.completed ? 'text-gray-600 line-through' : 'text-gray-100'}`}>
              {task.title}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              {task.due_date && (
                <span className={`inline-flex items-center gap-1 text-xs ${overdue ? 'text-red-400' : 'text-gray-500'}`}>
                  <CalendarDays size={11} aria-hidden="true" />
                  {format(new Date(`${task.due_date}T00:00:00`), 'MMM d')}{overdue && ' · overdue'}
                </span>
              )}
              {task.submit_url && <span className="inline-flex items-center gap-1 text-xs text-green-400"><Link2 size={11} aria-hidden="true" /> Submitted</span>}
              <AssigneeChips ids={assigneeIds} members={members} max={2} />
            </span>
          </span>
          <ChevronRight size={16} className="text-gray-600 flex-shrink-0" aria-hidden="true" />
        </button>
      </div>
    )
  }

  return (
    <div ref={setNodeRef} style={style} id={`subtask-${task.id}`} className={`${rowClass} py-1.5 px-1 -mx-1 hover:bg-gray-800/30`}>
      <DragHandle attributes={attributes} listeners={listeners} disabled={dragDisabled || !canEdit}
        label={`Reorder "${task.title}"`} />
      {checkbox}
      {editingTitle ? (
        <input className="input flex-1 min-w-0 py-1" value={titleVal} aria-label="Subtask title"
          onChange={e => setTitleVal(e.target.value)} onBlur={saveTitle}
          onKeyDown={e => {
            if (e.key === 'Enter') saveTitle()
            if (e.key === 'Escape') { setTitleVal(task.title); setEditingTitle(false) }
          }} autoFocus />
      ) : canEdit ? (
        <button type="button" onClick={() => { setTitleVal(task.title); setEditingTitle(true) }}
          title="Click to rename"
          className={`flex-1 min-w-0 text-left text-sm truncate rounded px-1 -mx-1 cursor-text hover:text-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${task.completed ? 'text-gray-600 line-through' : 'text-gray-200'}`}>
          {task.title}
        </button>
      ) : (
        <span className={`flex-1 min-w-0 text-sm truncate ${task.completed ? 'text-gray-600 line-through' : 'text-gray-200'}`}>{task.title}</span>
      )}

      {canSubmit && (task.submit_url ? (
        <a href={task.submit_url} target="_blank" rel="noopener noreferrer" title={task.submit_url}
          className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 flex-shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
          <Link2 size={12} aria-hidden="true" /> Submitted
        </a>
      ) : (
        <button type="button" onClick={() => onSubmitClick(task)}
          className="text-xs text-gray-500 hover:text-brand-400 flex-shrink-0 transition-colors duration-fast flex items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
          <Link2 size={12} aria-hidden="true" /> Submit
        </button>
      ))}

      <input type="date" aria-label={`Due date for "${task.title}"`}
        className={`input sm:text-xs w-36 py-1 flex-shrink-0 ${overdue ? 'border-red-700 text-red-400' : task.due_date ? '' : 'text-gray-500'}`}
        value={task.due_date ?? ''} onChange={e => canEdit && onDateChange(task.id, e.target.value || null)}
        readOnly={!canEdit} />

      <div className="w-56 flex-shrink-0 flex items-center gap-1">
        <span className="flex-1 min-w-0"><AssigneeChips ids={assigneeIds} members={members} /></span>
        {canEdit && <AssigneePopover taskId={task.id} assigneeIds={assigneeIds} members={members} onAssign={onAssign} />}
      </div>

      {isExec ? (
        <button type="button" onClick={() => onDelete(task.id)} aria-label={`Delete "${task.title}"`}
          className="reveal-on-hover p-1.5 rounded-md text-gray-600 hover:text-red-400 flex-shrink-0 transition-opacity duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
          <Trash2 size={13} aria-hidden="true" />
        </button>
      ) : <span className="w-7 flex-shrink-0" aria-hidden="true" />}
    </div>
  )
}
