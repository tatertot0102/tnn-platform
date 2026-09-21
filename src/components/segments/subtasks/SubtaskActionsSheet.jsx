import { useState } from 'react'
import { Check, Link2, Lock, Trash2 } from 'lucide-react'
import Modal from '../../ui/Modal'
import PeopleDropdown from '../../ui/PeopleDropdown'
import { getSubtaskAssigneeIds } from '../../../lib/subtasks'

// Phone view of a subtask: every action a desktop row shows inline, in a
// bottom sheet with thumb-sized controls. Mounted only while open.
export default function SubtaskActionsSheet({ task, members, canEdit, isExec, profileId, onClose, work, onSubmitClick }) {
  const [title, setTitle] = useState(task.title)
  const assigneeIds = getSubtaskAssigneeIds(task)
  const canSubmit = isExec || assigneeIds.includes(profileId)
  const locked = !!task.blockedBy

  function saveTitle() {
    const next = title.trim()
    if (next && next !== task.title) work.renameSubtask(task.id, next)
    else setTitle(task.title)
  }

  function setAssignees(nextIds) {
    const changed = [
      ...nextIds.filter(id => !assigneeIds.includes(id)),
      ...assigneeIds.filter(id => !nextIds.includes(id)),
    ]
    changed.forEach(id => work.assignSubtask(task.id, id))
  }

  return (
    <Modal open onClose={onClose} title="Subtask" size="sm">
      <div className="space-y-5 pb-1">
        <div>
          <label htmlFor="sheet-title" className="block text-xs font-medium text-gray-400 mb-1.5">Title</label>
          <input id="sheet-title" className="input" value={title} readOnly={!canEdit}
            onChange={e => setTitle(e.target.value)} onBlur={saveTitle}
            onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />
        </div>

        <button type="button" disabled={!canEdit || locked}
          onClick={() => work.toggleSubtask(task.id)}
          aria-pressed={!!task.completed}
          className={`w-full flex items-center justify-center gap-2 min-h-12 rounded-xl font-medium text-sm transition-all duration-fast active:scale-[0.98] disabled:opacity-50 ${task.completed ? 'bg-gray-800 text-gray-300' : 'bg-green-600 text-white'}`}>
          {locked ? <><Lock size={15} /> Blocked by “{task.blockedBy.title}”</>
            : task.completed ? 'Mark as not done' : <><Check size={16} /> Mark done</>}
        </button>

        <div>
          <label htmlFor="sheet-due" className="block text-xs font-medium text-gray-400 mb-1.5">Due date</label>
          <input id="sheet-due" type="date" className="input" value={task.due_date ?? ''} readOnly={!canEdit}
            onChange={e => canEdit && work.setSubtaskDate(task.id, e.target.value || null)} />
        </div>

        <div>
          <span className="block text-xs font-medium text-gray-400 mb-1.5">Assigned to</span>
          {members.length === 0 ? (
            <p className="text-xs text-gray-600">Add people to segment roles first.</p>
          ) : (
            <PeopleDropdown disabled={!canEdit} allowSelectAll={false}
              options={members.map(m => ({ id: m.id, label: m.full_name }))}
              selectedIds={assigneeIds} onChange={setAssignees} placeholder="Unassigned" />
          )}
        </div>

        {canSubmit && (
          <button type="button" onClick={() => onSubmitClick(task)}
            className="w-full flex items-center justify-center gap-2 min-h-11 rounded-xl border border-gray-700 text-sm text-gray-200 hover:bg-gray-800 transition-colors duration-fast">
            <Link2 size={15} /> {task.submit_url ? 'Change submitted link' : 'Submit a link'}
          </button>
        )}
        {task.submit_url && (
          <a href={task.submit_url} target="_blank" rel="noopener noreferrer"
            className="block text-center text-xs text-green-400 truncate">{task.submit_url}</a>
        )}

        {isExec && (
          <button type="button"
            onClick={() => { if (confirm(`Delete "${task.title}"?`)) { work.deleteSubtask(task.id); onClose() } }}
            className="w-full flex items-center justify-center gap-2 min-h-11 rounded-xl text-sm text-red-400 hover:bg-red-950/40 transition-colors duration-fast">
            <Trash2 size={15} /> Delete subtask
          </button>
        )}
      </div>
    </Modal>
  )
}
