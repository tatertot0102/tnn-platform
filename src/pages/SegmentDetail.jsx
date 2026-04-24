import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PriorityBadge, StatusBadge, DeptBadge } from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import Modal from '../components/ui/Modal'
import { PRIORITIES, STATUSES, DEPARTMENTS, PRIMARY_ROLES, SECONDARY_ROLES } from '../lib/constants'
import { format, isBefore, isToday } from 'date-fns'
import {
  Plus, Trash2, Check, ArrowLeft, ExternalLink,
  UserPlus, X, Flag, ChevronDown, ChevronRight, GripVertical, Link2, Pencil
} from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragOverlay, useDroppable
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ── Subtask assignee helpers ──────────────────────────────
function getSubtaskAssigneeIds(task) {
  if (Array.isArray(task.assignee_ids)) return task.assignee_ids.filter(Boolean)
  return task.assignee_id ? [task.assignee_id] : []
}

function getSubtaskAssigneeNames(task, members) {
  const ids = getSubtaskAssigneeIds(task)
  return ids
    .map(memberId => members.find(m => m.id === memberId)?.full_name)
    .filter(Boolean)
}

// ── Drive Link ────────────────────────────────────────────────
function DriveLink({ url, onSave, canEdit }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(url ?? '')
  function handleSave() { onSave(val.trim() || null); setEditing(false) }
  if (!url && !canEdit) return null
  return (
    <div className="flex items-center gap-2">
      {editing ? (
        <>
          <input className="input text-xs flex-1" placeholder="https://drive.google.com/..." value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false) }} autoFocus />
          <button onClick={handleSave} className="btn-primary text-xs px-3 py-1.5">Save</button>
          <button onClick={() => setEditing(false)} className="btn-ghost text-xs px-2 py-1.5">Cancel</button>
        </>
      ) : url ? (
        <div className="flex items-center gap-2">
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#4285F4"/>
              <path d="M2 17l10 5 10-5" stroke="#34A853" strokeWidth="2" fill="none"/>
              <path d="M2 12l10 5 10-5" stroke="#FBBC05" strokeWidth="2" fill="none"/>
            </svg>
            Open Drive Folder <ExternalLink size={11} />
          </a>
          {canEdit && <button onClick={() => setEditing(true)} className="text-xs text-gray-600 hover:text-gray-400">Edit</button>}
        </div>
      ) : canEdit ? (
        <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
          <Plus size={12} /> Link Drive folder
        </button>
      ) : null}
    </div>
  )
}

// ── Dept Editor ───────────────────────────────────────────────
function DeptEditor({ departments, onSave }) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(departments ?? [])

  function toggle(d) {
    const next = selected.includes(d) ? selected.filter(x => x !== d) : [...selected, d]
    setSelected(next)
  }

  function handleSave() { onSave(selected); setOpen(false) }

  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors border border-gray-700 rounded px-2 py-0.5">
        Edit depts
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-7 left-0 z-20 bg-gray-900 border border-gray-700 rounded-xl p-3 shadow-xl w-56">
            <p className="text-xs font-medium text-gray-500 mb-2">Toggle departments</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {Object.entries(DEPARTMENTS).map(([v, d]) => (
                <button key={v} type="button" onClick={() => toggle(v)}
                  className={`badge cursor-pointer transition-opacity ${d.color} ${selected.includes(v) ? 'opacity-100 ring-1 ring-white/20' : 'opacity-30'}`}>
                  {d.label}
                </button>
              ))}
            </div>
            <button onClick={handleSave} className="btn-primary w-full text-xs py-1.5">Save</button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Guest Modal ───────────────────────────────────────────────
function AddGuestModal({ open, onClose, segmentId, members, existingRoles, onAdded }) {
  const [userId, setUserId] = useState('')
  const [roleType, setRoleType] = useState('')
  const [saving, setSaving] = useState(false)
  const allRoles = [...PRIMARY_ROLES, ...SECONDARY_ROLES, 'Guest Contributor']
  const permanentIds = existingRoles.filter(r => !r.is_guest).map(r => r.user_id)
  const available = members.filter(m => !permanentIds.includes(m.id))
  async function handleAdd() {
    if (!userId || !roleType) return
    setSaving(true)
    const { data } = await supabase.from('segment_roles')
      .insert({ segment_id: segmentId, user_id: userId, role_type: roleType, is_guest: true })
      .select('*, profiles(full_name, id)').single()
    setSaving(false)
    if (data) { onAdded(data); onClose(); setUserId(''); setRoleType('') }
  }
  return (
    <Modal open={open} onClose={onClose} title="Add Temporary Contributor" size="sm">
      <div className="space-y-4">
        <p className="text-xs text-gray-500">Temporarily added — gets notifications but not permanent crew.</p>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Person</label>
          <select className="input" value={userId} onChange={e => setUserId(e.target.value)}>
            <option value="">Select member...</option>
            {available.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Role</label>
          <select className="input" value={roleType} onChange={e => setRoleType(e.target.value)}>
            <option value="">Select role...</option>
            {allRoles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleAdd} disabled={!userId || !roleType || saving} className="btn-primary flex items-center gap-2">
            {saving && <Spinner size={4} />} Add Guest
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Submit URL Modal ──────────────────────────────────────────
function SubmitUrlModal({ open, onClose, task, onSave }) {
  const [url, setUrl] = useState(task?.submit_url ?? '')
  function handleSave() { onSave(task.id, url.trim() || null); onClose() }
  return (
    <Modal open={open} onClose={onClose} title="Submit Link" size="sm">
      <div className="space-y-4">
        <p className="text-xs text-gray-500">Paste a link to your deliverable (Google Doc, Drive file, YouTube, etc.)</p>
        <input className="input" placeholder="https://..." value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()} autoFocus />
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleSave} className="btn-primary">Save Link</button>
        </div>
      </div>
    </Modal>
  )
}

// ── Draggable Subtask Row ─────────────────────────────────────
function SortableSubtaskRow({ task, segmentMembers, onToggle, onDelete, onAssign, onDateChange, canEdit, profileId, isExec, onSubmitClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }
  const isOverdue = task.due_date && !task.completed && isBefore(new Date(task.due_date), new Date()) && !isToday(new Date(task.due_date))
  const assigneeIds = getSubtaskAssigneeIds(task)
  const assigneeNames = getSubtaskAssigneeNames(task, segmentMembers)
  // Can submit: exec or any assigned person
  const canSubmit = isExec || assigneeIds.includes(profileId)

  return (
    <div ref={setNodeRef} style={style}
      className="flex items-center gap-2 group py-1.5 border-b border-gray-800/40 last:border-0">
      <div {...attributes} {...listeners} className="cursor-grab text-gray-700 hover:text-gray-400 flex-shrink-0 touch-none">
        <GripVertical size={14} />
      </div>
      <button onClick={() => canEdit && onToggle(task.id, task.completed)}
        className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${task.completed ? 'bg-green-600 border-green-600' : 'border-gray-600 hover:border-green-500'} ${!canEdit ? 'cursor-default' : ''}`}>
        {task.completed && <Check size={11} className="text-white" />}
      </button>
      <span className={`flex-1 text-sm min-w-0 truncate ${task.completed ? 'text-gray-600 line-through' : 'text-gray-200'}`}>
        {task.title}
      </span>
      {/* Submit link */}
      {canSubmit && (
        task.submit_url ? (
          <a href={task.submit_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 flex-shrink-0" title={task.submit_url}>
            <Link2 size={12} /> Submitted
          </a>
        ) : (
          <button onClick={() => onSubmitClick(task)}
            className="text-xs text-gray-600 hover:text-brand-400 flex-shrink-0 transition-colors flex items-center gap-1">
            <Link2 size={12} /> Submit
          </button>
        )
      )}
      <input type="date" className={`input text-xs w-32 py-1 flex-shrink-0 ${isOverdue ? 'border-red-700 text-red-400' : 'opacity-50 focus:opacity-100'}`}
        value={task.due_date ?? ''} onChange={e => canEdit && onDateChange(task.id, e.target.value || null)}
        readOnly={!canEdit} />
      <div className="w-56 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="flex flex-wrap gap-1 flex-1 min-w-0">
            {assigneeNames.length ? (
              assigneeNames.map(name => (
                <span
                  key={name}
                  className="text-xs bg-gray-800 text-gray-300 border border-gray-700 rounded-full px-2 py-0.5 max-w-24 truncate"
                  title={name}
                >
                  {name.split(' ')[0]}
                </span>
              ))
            ) : (
              <span className="text-xs text-gray-600 italic">Unassigned</span>
            )}
          </div>

          {canEdit && (
            <details className="relative flex-shrink-0">
              <summary className="list-none cursor-pointer text-gray-600 hover:text-brand-400 transition-colors" title="Edit assignees">
                <Pencil size={13} />
              </summary>
              <div className="absolute right-0 top-6 z-30 w-56 bg-gray-900 border border-gray-700 rounded-xl shadow-xl p-2 max-h-64 overflow-y-auto">
                <p className="text-xs text-gray-600 px-2 pb-1">Assign people</p>
                {segmentMembers.length === 0 ? (
                  <p className="text-xs text-gray-600 px-2 py-1">No members</p>
                ) : (
                  segmentMembers.map(m => {
                    const selected = assigneeIds.includes(m.id)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onAssign(task.id, m.id)}
                        className={`w-full flex items-center justify-between gap-2 text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${selected ? 'bg-brand-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'}`}
                      >
                        <span className="truncate">{m.full_name}</span>
                        {selected && <Check size={12} className="flex-shrink-0" />}
                      </button>
                    )
                  })
                )}
              </div>
            </details>
          )}
        </div>
      </div>
      {isExec && (
        <button onClick={() => onDelete(task.id)} className="text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0">
          <Trash2 size={13} />
        </button>
      )}
    </div>
  )
}

function StaticSubtaskRow({ task }) {
  return (
    <div className="flex items-center gap-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg px-3 shadow-xl">
      <GripVertical size={14} className="text-gray-500" />
      <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${task.completed ? 'bg-green-600 border-green-600' : 'border-gray-600'}`}>
        {task.completed && <Check size={11} className="text-white" />}
      </div>
      <span className="text-sm text-gray-200 flex-1">{task.title}</span>
    </div>
  )
}

// ── Droppable zone ────────────────────────────────────────────
function MilestoneDropZone({ id, children, isOver }) {
  const { setNodeRef } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={`min-h-8 rounded-lg transition-colors ${isOver ? 'bg-brand-600/10 ring-1 ring-brand-500/40' : ''}`}>
      {children}
    </div>
  )
}

// ── Milestone Block ───────────────────────────────────────────
function MilestoneBlock({ milestone, subtasks, segmentMembers, onToggle, onDelete, onAssign, onDateChange, onDeleteMilestone, onRename, onAddSubtask, canEdit, isExec, profileId, isOver, onSubmitClick }) {
  const [collapsed, setCollapsed] = useState(false)
  const [newTask, setNewTask] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleVal, setTitleVal] = useState(milestone.title)
  const total = subtasks.length
  const completed = subtasks.filter(t => t.completed).length
  const allDone = total > 0 && completed === total
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  function handleRename() { if (titleVal.trim()) onRename(milestone.id, titleVal.trim()); setEditingTitle(false) }

  return (
    <div className={`border rounded-xl mb-3 transition-all ${allDone ? 'border-green-800/60 bg-green-950/10' : isOver ? 'border-brand-500/50 bg-brand-950/20' : 'border-gray-800'}`}>
      <div className="flex items-center gap-2 px-4 py-3">
        <button onClick={() => setCollapsed(c => !c)} className="text-gray-500 hover:text-gray-300 flex-shrink-0">
          {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
        </button>
        <Flag size={13} className={`flex-shrink-0 ${allDone ? 'text-green-400' : 'text-brand-400'}`} />
        {editingTitle ? (
          <input className="input text-sm flex-1 py-1" value={titleVal} onChange={e => setTitleVal(e.target.value)}
            onBlur={handleRename} onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditingTitle(false) }} autoFocus />
        ) : (
          <span className={`text-sm font-semibold flex-1 ${allDone ? 'text-green-400' : 'text-gray-100'} ${isExec ? 'cursor-pointer hover:text-brand-300' : ''}`}
            onDoubleClick={() => isExec && setEditingTitle(true)} title={isExec ? 'Double-click to rename' : ''}>
            {milestone.title}
          </span>
        )}
        <div className="flex items-center gap-2 flex-shrink-0">
          {total > 0 && (
            <>
              <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${allDone ? 'bg-green-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs text-gray-500">{completed}/{total}</span>
            </>
          )}
          {allDone && <span className="badge bg-green-900 text-green-400 text-xs">Reached ✓</span>}
          {isExec && (
            <button onClick={() => onDeleteMilestone(milestone.id)} className="text-gray-700 hover:text-red-400 transition-colors">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
      {!collapsed && (
        <div className="px-4 pb-3">
          <MilestoneDropZone id={`milestone-${milestone.id}`} isOver={isOver}>
            <SortableContext items={subtasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
              {subtasks.length === 0 && <p className="text-xs text-gray-700 py-2 text-center">Drop subtasks here or add one below</p>}
              {subtasks.map(t => (
                <SortableSubtaskRow key={t.id} task={t} segmentMembers={segmentMembers}
                  onToggle={onToggle} onDelete={onDelete} onAssign={onAssign} onDateChange={onDateChange}
                  canEdit={canEdit} profileId={profileId} isExec={isExec} onSubmitClick={onSubmitClick} />
              ))}
            </SortableContext>
          </MilestoneDropZone>
          {canEdit && (
            <div className="flex gap-2 mt-2">
              <input className="input text-xs flex-1 py-1.5" placeholder={`Add task to ${milestone.title}...`}
                value={newTask} onChange={e => setNewTask(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newTask.trim()) { onAddSubtask(newTask.trim(), milestone.id); setNewTask('') } }} />
              <button className="btn-ghost text-xs px-2"
                onClick={() => { if (newTask.trim()) { onAddSubtask(newTask.trim(), milestone.id); setNewTask('') } }}>
                <Plus size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────
export default function SegmentDetail() {
  const { id }              = useParams()
  const { isExec, profile } = useAuth()
  const navigate            = useNavigate()

  const [seg, setSeg]               = useState(null)
  const [subtasks, setSubtasks]     = useState([])
  const [milestones, setMilestones] = useState([])
  const [roles, setRoles]           = useState([])
  const [members, setMembers]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [activeTab, setActiveTab]   = useState('overview')
  const [showGuestModal, setShowGuestModal]   = useState(false)
  const [submitTask, setSubmitTask]           = useState(null)
  const [newSubtask, setNewSubtask]     = useState('')
  const [newMilestone, setNewMilestone] = useState('')
  const [activeId, setActiveId] = useState(null)
  const [overId, setOverId]     = useState(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => { fetchAll() }, [id])

  async function fetchAll() {
    setLoading(true)
    const [{ data: segment }, { data: subs }, { data: miles }, { data: segRoles }, { data: allMembers }] =
      await Promise.all([
        supabase.from('segments').select('*').eq('id', id).single(),
        supabase.from('subtasks').select('*').eq('segment_id', id).order('position').order('created_at'),
        supabase.from('milestones').select('*').eq('segment_id', id).order('position').order('created_at'),
        supabase.from('segment_roles').select('*, profiles(full_name, id)').eq('segment_id', id),
        supabase.from('profiles').select('id, full_name, role'),
      ])
    setSeg(segment)
    setSubtasks(subs ?? [])
    setMilestones(miles ?? [])
    setRoles(segRoles ?? [])
    setMembers(allMembers ?? [])
    setLoading(false)
  }

  // canEdit: execs always; members only if they have a role on this segment
  const isMemberOnSegment = useMemo(() =>
    roles.some(r => r.user_id === profile?.id), [roles, profile])
  const canEdit = isExec || isMemberOnSegment

  async function updateSeg(field, value) {
    if (!canEdit) return
    setSaving(true)
    await supabase.from('segments').update({ [field]: value }).eq('id', id)
    setSeg(s => ({ ...s, [field]: value }))
    setSaving(false)
  }

  async function deleteSegment() {
    if (!isExec) return
    if (!confirm(`Delete "${seg.title}"? Cannot be undone.`)) return
    await supabase.from('segments').delete().eq('id', id)
    navigate('/segments')
  }

  // ── Subtasks ──
  async function addSubtask(title, milestoneId = null) {
    if (!canEdit) return
    const { data } = await supabase.from('subtasks')
      .insert({ segment_id: id, title, completed: false, milestone_id: milestoneId, assignee_ids: [] })
      .select('*').single()
    setSubtasks(s => [...s, data])
  }

  async function toggleSubtask(subtaskId, completed) {
    await supabase.from('subtasks').update({ completed: !completed }).eq('id', subtaskId)
    setSubtasks(s => s.map(t => t.id === subtaskId ? { ...t, completed: !completed } : t))
  }

  async function deleteSubtask(subtaskId) {
    if (!isExec) return
    await supabase.from('subtasks').delete().eq('id', subtaskId)
    setSubtasks(s => s.filter(t => t.id !== subtaskId))
  }

  async function assignSubtask(subtaskId, userId) {
    if (!canEdit) return

    const currentTask = subtasks.find(t => t.id === subtaskId)
    if (!currentTask) return

    const currentIds = getSubtaskAssigneeIds(currentTask)
    const nextIds = currentIds.includes(userId)
      ? currentIds.filter(id => id !== userId)
      : [...currentIds, userId]

    await supabase.from('subtasks').update({ assignee_ids: nextIds }).eq('id', subtaskId)
    setSubtasks(s => s.map(t =>
      t.id === subtaskId ? { ...t, assignee_ids: nextIds, assignee_id: nextIds[0] ?? null } : t
    ))
  }

  async function updateSubtaskDate(subtaskId, date) {
    if (!canEdit) return
    await supabase.from('subtasks').update({ due_date: date }).eq('id', subtaskId)
    setSubtasks(s => s.map(t => t.id === subtaskId ? { ...t, due_date: date } : t))
  }

  async function saveSubmitUrl(subtaskId, url) {
    await supabase.from('subtasks').update({ submit_url: url }).eq('id', subtaskId)
    setSubtasks(s => s.map(t => t.id === subtaskId ? { ...t, submit_url: url } : t))
  }

  // ── Drag and drop ──
  function findContainer(taskId) {
    const task = subtasks.find(t => t.id === taskId)
    if (!task) return null
    return task.milestone_id ? `milestone-${task.milestone_id}` : 'ungrouped'
  }

  function handleDragStart({ active }) { setActiveId(active.id) }

  function handleDragOver({ active, over }) {
    if (!over) { setOverId(null); return }
    setOverId(over.id)
    const activeContainer = findContainer(active.id)
    let overContainer = over.id
    if (subtasks.find(t => t.id === over.id)) overContainer = findContainer(over.id)
    if (activeContainer === overContainer) return
    const milestoneId = overContainer === 'ungrouped' ? null
      : overContainer.startsWith('milestone-') ? overContainer.replace('milestone-', '') : null
    setSubtasks(prev => prev.map(t => t.id === active.id ? { ...t, milestone_id: milestoneId } : t))
  }

  async function handleDragEnd({ active, over }) {
    setActiveId(null); setOverId(null)
    if (!over) return
    const activeContainer = findContainer(active.id)
    let overContainer = over.id
    if (subtasks.find(t => t.id === over.id)) overContainer = findContainer(over.id)
    const milestoneId = overContainer === 'ungrouped' ? null
      : overContainer.startsWith('milestone-') ? overContainer.replace('milestone-', '') : null

    if (activeContainer === overContainer && active.id !== over.id) {
      const containerTasks = subtasks.filter(t => milestoneId ? t.milestone_id === milestoneId : !t.milestone_id)
      const oldIdx = containerTasks.findIndex(t => t.id === active.id)
      const newIdx = containerTasks.findIndex(t => t.id === over.id)
      if (oldIdx !== -1 && newIdx !== -1) {
        const reordered = arrayMove(containerTasks, oldIdx, newIdx)
        setSubtasks(prev => {
          const others = prev.filter(t => milestoneId ? t.milestone_id !== milestoneId : t.milestone_id)
          return [...others, ...reordered]
        })
        await Promise.all(reordered.map((t, i) => supabase.from('subtasks').update({ position: i }).eq('id', t.id)))
        return
      }
    }
    await supabase.from('subtasks').update({ milestone_id: milestoneId }).eq('id', active.id)
    setSubtasks(s => s.map(t => t.id === active.id ? { ...t, milestone_id: milestoneId } : t))
  }

  // ── Milestones ──
  async function addMilestone() {
    if (!newMilestone.trim() || !isExec) return
    const { data } = await supabase.from('milestones')
      .insert({ segment_id: id, title: newMilestone.trim(), position: milestones.length }).select().single()
    setMilestones(m => [...m, data])
    setNewMilestone('')
  }

  async function deleteMilestone(milestoneId) {
    if (!isExec) return
    if (!confirm('Delete milestone? Subtasks become ungrouped.')) return
    await supabase.from('milestones').delete().eq('id', milestoneId)
    setMilestones(m => m.filter(x => x.id !== milestoneId))
    setSubtasks(s => s.map(t => t.milestone_id === milestoneId ? { ...t, milestone_id: null } : t))
  }

  async function renameMilestone(milestoneId, title) {
    if (!isExec) return
    await supabase.from('milestones').update({ title }).eq('id', milestoneId)
    setMilestones(m => m.map(x => x.id === milestoneId ? { ...x, title } : x))
  }

  // ── Roles ──
  async function addRole(roleType, userId) {
    if (!isExec || !userId) return
    const { data } = await supabase.from('segment_roles')
      .insert({ segment_id: id, user_id: userId, role_type: roleType, is_guest: false })
      .select('*, profiles(full_name, id)').single()
    if (data) setRoles(r => [...r, data])
  }

  async function removeRole(roleId) {
    if (!isExec) return
    await supabase.from('segment_roles').delete().eq('id', roleId)
    setRoles(r => r.filter(x => x.id !== roleId))
  }

  if (loading) return <div className="flex justify-center py-24"><Spinner size={8} /></div>
  if (!seg)    return <p className="text-gray-400">Segment not found.</p>

  const permanentRoles   = roles.filter(r => !r.is_guest)
  const guestRoles       = roles.filter(r => r.is_guest)
  const segmentMemberIds = [...new Set(roles.map(r => r.user_id))]
  const segmentMembers   = members.filter(m => segmentMemberIds.includes(m.id))
  const ungrouped        = subtasks.filter(t => !t.milestone_id)
  const completedCount   = subtasks.filter(t => t.completed).length
  const activeTask       = activeId ? subtasks.find(t => t.id === activeId) : null
  const today            = new Date()
  const overdueCount     = subtasks.filter(t => t.due_date && !t.completed && isBefore(new Date(t.due_date), today) && !isToday(new Date(t.due_date))).length

  return (
    <div>
      <button onClick={() => navigate('/segments')} className="flex items-center gap-1.5 text-gray-400 hover:text-gray-100 text-sm mb-6 transition-colors">
        <ArrowLeft size={15} /> Back to Segments
      </button>

      {/* Header */}
      <div className="card p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            {canEdit ? (
              <input className="text-2xl font-bold text-white bg-transparent border-none outline-none w-full focus:bg-gray-800 rounded px-1 -ml-1 transition-colors"
                value={seg.title} onChange={e => setSeg(s => ({ ...s, title: e.target.value }))}
                onBlur={e => updateSeg('title', e.target.value)} />
            ) : (
              <h1 className="text-2xl font-bold text-white">{seg.title}</h1>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {seg.departments?.map(d => <DeptBadge key={d} value={d} />)}
              {isExec && (
                <DeptEditor
                  departments={seg.departments ?? []}
                  onSave={depts => updateSeg('departments', depts)}
                />
              )}
            </div>
            <div className="mt-3">
              <DriveLink url={seg.drive_url} canEdit={isExec} onSave={url => updateSeg('drive_url', url)} />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
            {saving && <Spinner size={4} />}
            {isExec ? (
              <>
                <select className="input w-auto text-xs" value={seg.priority} onChange={e => updateSeg('priority', e.target.value)}>
                  {Object.entries(PRIORITIES).map(([v, p]) => <option key={v} value={v}>{p.label}</option>)}
                </select>
                <select className="input w-auto text-xs" value={seg.status} onChange={e => updateSeg('status', e.target.value)}>
                  {Object.entries(STATUSES).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
                </select>
                <button onClick={deleteSegment}
                  className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-400 hover:bg-red-950 border border-red-900 px-3 py-1.5 rounded-lg transition-colors">
                  <Trash2 size={13} /> Delete
                </button>
              </>
            ) : canEdit ? (
              // Members on the segment can change status
              <select className="input w-auto text-xs" value={seg.status} onChange={e => updateSeg('status', e.target.value)}>
                {Object.entries(STATUSES).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
              </select>
            ) : (
              <><PriorityBadge value={seg.priority} /><StatusBadge value={seg.status} /></>
            )}
            {!isExec && canEdit && <PriorityBadge value={seg.priority} />}
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 pt-5 border-t border-gray-800">
          {[{ label: 'Start Date', field: 'start_date' }, { label: 'Due Date', field: 'due_date' }].map(({ label, field }) => (
            <div key={field}>
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              {isExec ? (
                <input className="input text-xs" type="date" value={seg[field] ?? ''} onChange={e => updateSeg(field, e.target.value || null)} />
              ) : (
                <p className="text-sm text-gray-200">{seg[field] ? format(new Date(seg[field]), 'MMM d, yyyy') : '—'}</p>
              )}
            </div>
          ))}
          <div>
            <p className="text-xs text-gray-500 mb-1">Progress</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-brand-500 rounded-full transition-all"
                  style={{ width: subtasks.length ? `${Math.round((completedCount / subtasks.length) * 100)}%` : '0%' }} />
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0">{completedCount}/{subtasks.length}</span>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Team</p>
            <p className="text-sm text-gray-200">
              {permanentRoles.length} crew{guestRoles.length > 0 ? ` + ${guestRoles.length} guest${guestRoles.length > 1 ? 's' : ''}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800 mb-6">
        {['overview', 'subtasks', 'roles', 'notes'].map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${activeTab === t ? 'border-brand-400 text-brand-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
            {t}
            {t === 'subtasks' && subtasks.length > 0 && (
              <span className={`ml-1.5 badge text-xs ${overdueCount > 0 ? 'bg-red-900 text-red-400' : 'bg-gray-800 text-gray-400'}`}>
                {overdueCount > 0 ? `${overdueCount} overdue` : subtasks.length}
              </span>
            )}
            {t === 'roles' && guestRoles.length > 0 && (
              <span className="ml-1.5 badge bg-yellow-900 text-yellow-400 text-xs">{guestRoles.length} guest</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Team</h3>
              <div className="space-y-3">
                {PRIMARY_ROLES.map(role => {
                  const assigned = permanentRoles.filter(r => r.role_type === role)
                  return (
                    <div key={role} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-24 flex-shrink-0">{role}</span>
                      {assigned.length === 0 ? (
                        <span className="text-xs text-gray-700 italic">Unassigned</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {assigned.map(r => (
                            <span key={r.id} className="flex items-center gap-1 text-xs bg-gray-800 text-gray-300 rounded-full px-2 py-0.5">
                              <span className="w-4 h-4 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                                {r.profiles?.full_name?.[0]}
                              </span>
                              {r.profiles?.full_name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
                {guestRoles.length > 0 && (
                  <div className="pt-2 mt-2 border-t border-gray-800">
                    <p className="text-xs text-gray-600 mb-1.5">Guests</p>
                    <div className="flex flex-wrap gap-1">
                      {guestRoles.map(r => (
                        <span key={r.id} className="text-xs bg-yellow-950 text-yellow-400 border border-yellow-900/40 rounded-full px-2 py-0.5">
                          {r.profiles?.full_name} · {r.role_type}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="card p-5">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Progress</h3>
              {subtasks.length === 0 ? (
                <p className="text-gray-600 text-sm">No subtasks added yet.</p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Overall</span>
                      <span>{completedCount}/{subtasks.length} done</span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-500 rounded-full transition-all"
                        style={{ width: `${Math.round((completedCount / subtasks.length) * 100)}%` }} />
                    </div>
                  </div>
                  {milestones.map(m => {
                    const mSubs = subtasks.filter(t => t.milestone_id === m.id)
                    const mDone = mSubs.filter(t => t.completed).length
                    const allDone = mSubs.length > 0 && mDone === mSubs.length
                    if (mSubs.length === 0) return null
                    return (
                      <div key={m.id}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <div className="flex items-center gap-1.5">
                            <Flag size={10} className={allDone ? 'text-green-400' : 'text-brand-400'} />
                            <span className={allDone ? 'text-green-400' : 'text-gray-400'}>{m.title}</span>
                          </div>
                          <span className={allDone ? 'text-green-400' : 'text-gray-500'}>{mDone}/{mSubs.length}</span>
                        </div>
                        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${allDone ? 'bg-green-500' : 'bg-brand-500'}`}
                            style={{ width: `${Math.round((mDone / mSubs.length) * 100)}%` }} />
                        </div>
                      </div>
                    )
                  })}
                  {overdueCount > 0 && (
                    <div className="flex items-center gap-2 bg-red-950/40 border border-red-900/40 rounded-lg px-3 py-2 mt-1">
                      <span className="text-red-400 text-xs font-medium">{overdueCount} subtask{overdueCount > 1 ? 's' : ''} overdue</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          {seg.notes && (
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</h3>
                <button onClick={() => setActiveTab('notes')} className="text-xs text-brand-400 hover:underline">View all</button>
              </div>
              <p className="text-sm text-gray-400 line-clamp-3 whitespace-pre-wrap leading-relaxed">{seg.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Subtasks ── */}
      {activeTab === 'subtasks' && (
        <DndContext sensors={sensors} collisionDetection={closestCenter}
          onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          <div>
            {segmentMembers.length === 0 && isExec && (
              <p className="text-xs text-yellow-600 mb-4 px-1">⚠ Assign people to roles first to enable subtask assignment.</p>
            )}
            {milestones.map(m => (
              <MilestoneBlock key={m.id} milestone={m}
                subtasks={subtasks.filter(t => t.milestone_id === m.id)}
                segmentMembers={segmentMembers}
                onToggle={toggleSubtask} onDelete={deleteSubtask} onAssign={assignSubtask} onDateChange={updateSubtaskDate}
                onDeleteMilestone={deleteMilestone} onRename={renameMilestone} onAddSubtask={addSubtask}
                canEdit={canEdit} isExec={isExec} profileId={profile?.id}
                isOver={overId === `milestone-${m.id}`} onSubmitClick={setSubmitTask} />
            ))}
            <div className={`card p-5 mb-4 transition-colors ${overId === 'ungrouped' ? 'border-brand-500/50 bg-brand-950/10' : ''}`}>
              {milestones.length > 0 && <p className="text-xs text-gray-600 font-medium mb-3 uppercase tracking-wider">Ungrouped</p>}
              <MilestoneDropZone id="ungrouped" isOver={overId === 'ungrouped'}>
                <SortableContext items={ungrouped.map(t => t.id)} strategy={verticalListSortingStrategy}>
                  {ungrouped.length === 0 && milestones.length > 0 && <p className="text-xs text-gray-700 py-2 text-center">Drop subtasks here to ungroup them</p>}
                  {ungrouped.length === 0 && milestones.length === 0 && <p className="text-gray-500 text-sm mb-3">No subtasks yet.</p>}
                  {ungrouped.map(t => (
                    <SortableSubtaskRow key={t.id} task={t} segmentMembers={segmentMembers}
                      onToggle={toggleSubtask} onDelete={deleteSubtask} onAssign={assignSubtask} onDateChange={updateSubtaskDate}
                      canEdit={canEdit} profileId={profile?.id} isExec={isExec} onSubmitClick={setSubmitTask} />
                  ))}
                </SortableContext>
              </MilestoneDropZone>
              {canEdit && (
                <div className="flex gap-2 mt-3">
                  <input className="input flex-1" placeholder="Add a subtask..." value={newSubtask}
                    onChange={e => setNewSubtask(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newSubtask.trim()) { addSubtask(newSubtask.trim(), null); setNewSubtask('') } }} />
                  <button className="btn-primary flex items-center gap-2"
                    onClick={() => { if (newSubtask.trim()) { addSubtask(newSubtask.trim(), null); setNewSubtask('') } }}>
                    <Plus size={15} /> Add
                  </button>
                </div>
              )}
            </div>
            {isExec && (
              <div className="flex gap-2">
                <input className="input flex-1 text-sm" placeholder="New milestone name..."
                  value={newMilestone} onChange={e => setNewMilestone(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addMilestone()} />
                <button className="btn-ghost flex items-center gap-2 border border-gray-700" onClick={addMilestone}>
                  <Flag size={14} className="text-brand-400" /> Add Milestone
                </button>
              </div>
            )}
          </div>
          <DragOverlay>{activeTask && <StaticSubtaskRow task={activeTask} />}</DragOverlay>
        </DndContext>
      )}

      {/* ── Roles ── */}
      {activeTab === 'roles' && (
        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Primary Roles</h3>
            <div className="space-y-4">
              {PRIMARY_ROLES.map(role => {
                const assigned = permanentRoles.filter(r => r.role_type === role)
                return (
                  <div key={role} className="p-3 bg-gray-800/50 rounded-lg">
                    <p className="text-sm font-medium text-gray-200 mb-2">{role}</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {assigned.map(r => (
                        <div key={r.id} className="flex items-center gap-1.5 bg-gray-700 rounded-full pl-2 pr-1 py-0.5">
                          <span className="text-xs text-gray-200">{r.profiles?.full_name}</span>
                          {isExec && <button onClick={() => removeRole(r.id)} className="text-gray-500 hover:text-red-400"><X size={12} /></button>}
                        </div>
                      ))}
                      {assigned.length === 0 && <span className="text-xs text-gray-600 italic">No one assigned</span>}
                    </div>
                    {isExec && (
                      <select className="input text-xs w-auto" value="" onChange={e => { if (e.target.value) addRole(role, e.target.value) }}>
                        <option value="">+ Add person...</option>
                        {members.filter(m => !assigned.find(r => r.user_id === m.id)).map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                      </select>
                    )}
                  </div>
                )
              })}
            </div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-6 mb-4">Secondary Roles</h3>
            <div className="space-y-3">
              {SECONDARY_ROLES.map(role => {
                const assigned = permanentRoles.filter(r => r.role_type === role)
                return (
                  <div key={role} className="flex items-center gap-4 p-3 bg-gray-800/30 rounded-lg">
                    <span className="text-sm text-gray-400 w-36 flex-shrink-0">{role}</span>
                    <div className="flex flex-wrap gap-1.5 flex-1">
                      {assigned.map(r => (
                        <div key={r.id} className="flex items-center gap-1 bg-gray-700 rounded-full pl-2 pr-1 py-0.5">
                          <span className="text-xs text-gray-300">{r.profiles?.full_name}</span>
                          {isExec && <button onClick={() => removeRole(r.id)} className="text-gray-500 hover:text-red-400"><X size={11} /></button>}
                        </div>
                      ))}
                    </div>
                    {isExec && (
                      <select className="input text-xs w-auto flex-shrink-0" value="" onChange={e => { if (e.target.value) addRole(role, e.target.value) }}>
                        <option value="">+ Add...</option>
                        {members.filter(m => !assigned.find(r => r.user_id === m.id)).map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                      </select>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-300">Temporary Contributors</h3>
                <p className="text-xs text-gray-600 mt-0.5">Outsourced help, specialists, one-off contributors</p>
              </div>
              {isExec && (
                <button onClick={() => setShowGuestModal(true)} className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5">
                  <UserPlus size={13} /> Add Guest
                </button>
              )}
            </div>
            {guestRoles.length === 0 ? (
              <p className="text-gray-600 text-sm">No temporary contributors.</p>
            ) : (
              <div className="space-y-2">
                {guestRoles.map(r => (
                  <div key={r.id} className="flex items-center justify-between p-3 bg-yellow-950/30 border border-yellow-900/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-yellow-700 flex items-center justify-center text-xs font-bold text-yellow-100">
                        {r.profiles?.full_name?.[0] ?? '?'}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-200">{r.profiles?.full_name}</p>
                        <p className="text-xs text-gray-500">{r.role_type}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="badge bg-yellow-900 text-yellow-400">Guest</span>
                      {isExec && <button onClick={() => removeRole(r.id)} className="text-gray-600 hover:text-red-400 ml-1"><X size={14} /></button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Notes ── */}
      {activeTab === 'notes' && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Notes & Instructions</h3>
          {canEdit ? (
            <textarea className="input resize-none w-full" rows={12}
              placeholder="Add notes, instructions, or context for the team..."
              value={seg.notes ?? ''}
              onChange={e => setSeg(s => ({ ...s, notes: e.target.value }))}
              onBlur={e => updateSeg('notes', e.target.value)} />
          ) : (
            <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
              {seg.notes || <span className="text-gray-600">No notes added.</span>}
            </div>
          )}
        </div>
      )}

      <AddGuestModal open={showGuestModal} onClose={() => setShowGuestModal(false)}
        segmentId={id} members={members} existingRoles={roles}
        onAdded={r => setRoles(prev => [...prev, r])} />

      <SubmitUrlModal open={!!submitTask} onClose={() => setSubmitTask(null)}
        task={submitTask} onSave={saveSubmitUrl} />
    </div>
  )
}