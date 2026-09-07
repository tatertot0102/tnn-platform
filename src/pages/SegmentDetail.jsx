import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PriorityBadge, StatusBadge, DeptBadge } from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import ErrorState from '../components/ui/ErrorState'
import { useToast } from '../context/ToastContext'
import Modal from '../components/ui/Modal'
import { PRIORITIES, STATUSES, DEPARTMENTS, PRIMARY_ROLES, SECONDARY_ROLES } from '../lib/constants'
import ApprovalGateRow from '../components/segments/ApprovalGateRow'
import ApprovalGateModal from '../components/segments/ApprovalGateModal'
import ApprovalFeedbackModal from '../components/segments/ApprovalFeedbackModal'
import { format, isBefore, isToday } from 'date-fns'
import {
  Plus, Trash2, Check, ArrowLeft, ExternalLink,
  UserPlus, X, Flag, ChevronDown, ChevronRight, GripVertical, Link2, Pencil, ShieldCheck, Lock
} from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragOverlay, useDroppable
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const PUBLIC_CMS_VIDEO_URL = 'https://bthstnn.org/#/newsroom/videos'
const PUBLIC_STORY_URL = 'https://bthstnn.org/#/videos/story'

function slugify(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function buildPublicCredits(roles = []) {
  const grouped = new Map()

  roles.forEach(role => {
    const key = role.user_id || role.profiles?.full_name || role.id
    if (!key) return

    const existing = grouped.get(key) || {
      profile_id: role.user_id || '',
      name: role.profiles?.full_name || '',
      roles: [],
      show: true,
    }

    if (role.role_type && !existing.roles.includes(role.role_type)) {
      existing.roles.push(role.role_type)
    }

    grouped.set(key, existing)
  })

  return [...grouped.values()].map(credit => ({
    ...credit,
    role: credit.roles.join(', '),
  }))
}

function publicVideoStatus(video) {
  if (!video) return { label: 'Not sent to CMS', className: 'bg-gray-800 text-gray-300' }
  if (video.published || video.publish_status === 'published') return { label: 'Published', className: 'bg-green-900 text-green-300' }
  if (video.upload_status === 'published' && video.href && video.href !== '#pending-upload') return { label: 'Ready / uploaded', className: 'bg-blue-900 text-blue-300' }
  return { label: 'Public draft created', className: 'bg-purple-900 text-purple-300' }
}

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
function SortableSubtaskRow({ task, segmentMembers, onToggle, onDelete, onAssign, onDateChange, onRename, canEdit, profileId, isExec, onSubmitClick, highlighted, blockedBy }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleVal, setTitleVal] = useState(task.title)

  function saveTitle() {
    const next = titleVal.trim()
    setEditingTitle(false)
    if (next && next !== task.title) onRename(task.id, next)
    else setTitleVal(task.title)
  }
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }
  const isOverdue = task.due_date && !task.completed && isBefore(new Date(task.due_date), new Date()) && !isToday(new Date(task.due_date))
  const assigneeIds = getSubtaskAssigneeIds(task)
  const assigneeNames = getSubtaskAssigneeNames(task, segmentMembers)
  // Can submit: exec or any assigned person
  const canSubmit = isExec || assigneeIds.includes(profileId)

  return (
    <div ref={setNodeRef} style={style} id={`subtask-${task.id}`}
      className={`flex items-center gap-2 group py-1.5 border-b border-gray-800/40 last:border-0 rounded-lg transition-colors ${blockedBy ? 'opacity-50' : ''} ${highlighted ? 'bg-brand-950/40 ring-1 ring-brand-500/60' : ''}`}>
      <div {...attributes} {...listeners} className="cursor-grab text-gray-700 hover:text-gray-400 flex-shrink-0 touch-none">
        <GripVertical size={14} />
      </div>
      <button onClick={() => canEdit && !blockedBy && onToggle(task.id, task.completed)}
        disabled={!!blockedBy}
        title={blockedBy ? `Blocked until "${blockedBy.title}" is approved` : ''}
        className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${task.completed ? 'bg-green-600 border-green-600' : 'border-gray-600 hover:border-green-500'} ${(!canEdit || blockedBy) ? 'cursor-default hover:border-gray-600' : ''}`}>
        {task.completed ? <Check size={11} className="text-white" />
          : blockedBy ? <Lock size={10} className="text-gray-600" /> : null}
      </button>
      {editingTitle ? (
        <input className="input text-sm flex-1 min-w-0 py-1" value={titleVal}
          onChange={e => setTitleVal(e.target.value)} onBlur={saveTitle}
          onKeyDown={e => {
            if (e.key === 'Enter') saveTitle()
            if (e.key === 'Escape') { setTitleVal(task.title); setEditingTitle(false) }
          }} autoFocus />
      ) : (
        <span
          onClick={() => canEdit && (setTitleVal(task.title), setEditingTitle(true))}
          title={canEdit ? 'Click to rename' : task.title}
          className={`flex-1 text-sm min-w-0 truncate ${canEdit ? 'cursor-text hover:text-brand-300' : ''} ${task.completed ? 'text-gray-600 line-through' : 'text-gray-200'}`}>
          {task.title}
        </span>
      )}
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
function MilestoneBlock({ milestone, subtasks, items, renderRow, onDeleteMilestone, onRename, onAddSubtask, onAddGate, canEdit, isExec, isOver }) {
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
            <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
              {items.length === 0 && <p className="text-xs text-gray-700 py-2 text-center">Drop subtasks here or add one below</p>}
              {items.map(renderRow)}
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
              <button className="btn-ghost text-xs px-2" title="Add approval gate"
                onClick={() => onAddGate(milestone.id)}>
                <ShieldCheck size={14} className="text-brand-400" />
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
  const [searchParams]      = useSearchParams()
  const highlightId         = searchParams.get('highlight')
  const highlightGateId     = searchParams.get('gate')

  const [seg, setSeg]               = useState(null)
  const [subtasks, setSubtasks]     = useState([])
  const [gates, setGates]           = useState([])
  const [gateFeedback, setGateFeedback] = useState([])
  const [milestones, setMilestones] = useState([])
  const [roles, setRoles]           = useState([])
  const [members, setMembers]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState(false)
  const toast = useToast()
  const [saving, setSaving]         = useState(false)
  const [activeTab, setActiveTab]   = useState(searchParams.get('tab') === 'subtasks' || searchParams.get('gate') ? 'subtasks' : 'overview')
  const [showGuestModal, setShowGuestModal]   = useState(false)
  const [submitTask, setSubmitTask]           = useState(null)
  const [newSubtask, setNewSubtask]     = useState('')
  const [gateModal, setGateModal]       = useState(null)   // { gate } — gate null means "new"
  const [feedbackModal, setFeedbackModal] = useState(null) // { gate, kind }
  const [newMilestone, setNewMilestone] = useState('')
  const [activeId, setActiveId] = useState(null)
  const [overId, setOverId]     = useState(null)
  const [publicVideo, setPublicVideo] = useState(null)
  const [handoffSaving, setHandoffSaving] = useState(false)
  const [handoffMessage, setHandoffMessage] = useState('')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => { fetchAll() }, [id])

  useEffect(() => {
    if (!highlightId || loading) return
    const el = document.getElementById(`subtask-${highlightId}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightId, loading, subtasks])

  useEffect(() => {
    if (!highlightGateId || loading) return
    const el = document.getElementById(`gate-${highlightGateId}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightGateId, loading, gates])

  useEffect(() => {
    async function refreshPublicVideo() {
      const { data } = await supabase
        .from('videos')
        .select('*')
        .eq('segment_id', id)
        .order('updated_at', { ascending: false })
        .limit(1)
      setPublicVideo(data?.[0] || null)
    }

    window.addEventListener('focus', refreshPublicVideo)
    return () => window.removeEventListener('focus', refreshPublicVideo)
  }, [id])

  async function fetchAll() {
    setLoading(true)
    setLoadError(false)
    const [
      { data: segment, error: segError }, { data: subs, error: subError }, { data: miles, error: mileError },
      { data: segRoles, error: roleError }, { data: allMembers, error: memberError }, { data: linkedVideos },
      { data: segGates },
    ] = await Promise.all([
      supabase.from('segments').select('*').eq('id', id).single(),
      supabase.from('subtasks').select('*').eq('segment_id', id).order('position').order('created_at'),
      supabase.from('milestones').select('*').eq('segment_id', id).order('position').order('created_at'),
      supabase.from('segment_roles').select('*, profiles(full_name, id)').eq('segment_id', id),
      supabase.from('profiles').select('id, full_name, role'),
      supabase.from('videos').select('*').eq('segment_id', id).order('updated_at', { ascending: false }).limit(1),
      supabase.from('approval_gates').select('*').eq('segment_id', id).order('position').order('created_at'),
    ])

    // segError covers "not found" too (.single() with no row) — handled below via !seg, not as a hard error.
    if (subError || mileError || roleError || memberError) {
      setLoadError(true)
      setLoading(false)
      return
    }

    setSeg(segment)
    setSubtasks(subs ?? [])
    setGates(segGates ?? [])
    setGateFeedback(await fetchGateFeedback(segGates ?? []))
    setMilestones(miles ?? [])
    setRoles(segRoles ?? [])
    setMembers(allMembers ?? [])
    setPublicVideo(linkedVideos?.[0] || null)
    setLoading(false)
  }

  // canEdit: execs always; members only if they have a role on this segment
  const isMemberOnSegment = useMemo(() =>
    roles.some(r => r.user_id === profile?.id), [roles, profile])
  const canEdit = isExec || isMemberOnSegment

  async function updateSeg(field, value) {
    if (!canEdit) return
    setSaving(true)
    const { error } = await supabase.from('segments').update({ [field]: value }).eq('id', id)
    if (error) { toast.error('Could not save changes.'); setSaving(false); return }
    setSeg(s => ({ ...s, [field]: value }))
    setSaving(false)
  }

  async function deleteSegment() {
    if (!isExec) return
    if (!confirm(`Delete "${seg.title}"? Cannot be undone.`)) return
    const { error } = await supabase.from('segments').delete().eq('id', id)
    if (error) { toast.error('Could not delete segment.'); return }
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

  async function renameSubtask(subtaskId, title) {
    if (!canEdit) return
    const { error } = await supabase.from('subtasks').update({ title }).eq('id', subtaskId)
    if (error) { toast.error('Could not rename the subtask.'); return }
    setSubtasks(s => s.map(t => t.id === subtaskId ? { ...t, title } : t))
  }

  async function saveSubmitUrl(subtaskId, url) {
    await supabase.from('subtasks').update({ submit_url: url }).eq('id', subtaskId)
    setSubtasks(s => s.map(t => t.id === subtaskId ? { ...t, submit_url: url } : t))
  }

  // ── Approval gates ──
  async function fetchGateFeedback(gateList) {
    const gateIds = gateList.map(g => g.id)
    if (gateIds.length === 0) return []
    const { data } = await supabase.from('approval_feedback')
      .select('*').in('gate_id', gateIds).order('created_at')
    return data ?? []
  }

  async function saveGate(values) {
    if (!canEdit) return
    const editing = gateModal?.gate

    if (editing) {
      const { data, error } = await supabase.from('approval_gates')
        .update(values).eq('id', editing.id).select('*').single()
      if (error) { toast.error('Could not save the approval gate.'); return }
      setGates(g => g.map(x => x.id === data.id ? data : x))
      return
    }

    const { data, error } = await supabase.from('approval_gates')
      .insert({
        ...values, segment_id: id, created_by: profile?.id,
        position: orderedItems(values.milestone_id ?? null).length,
      })
      .select('*').single()
    if (error) { toast.error('Could not create the approval gate.'); return }
    setGates(g => [...g, data])
    toast.success('Approval gate created. The approver has been notified.')
  }

  async function deleteGate(gateId) {
    if (!isExec) return
    if (!confirm('Delete this approval gate and its feedback?')) return
    const { error } = await supabase.from('approval_gates').delete().eq('id', gateId)
    if (error) { toast.error('Could not delete the approval gate.'); return }
    setGates(g => g.filter(x => x.id !== gateId))
    setGateFeedback(f => f.filter(x => x.gate_id !== gateId))
  }

  function approveGate(gate) { return submitGateFeedback(gate, 'approved', '') }

  // Feedback rows are mirrored into the segment's chat channel by a database
  // trigger, so posting one here is all that's needed.
  async function submitGateFeedback(gate, kind, body) {
    const text = body || (kind === 'approved' ? 'Approved.' : 'Changes requested.')

    if (kind !== 'comment') {
      const { data, error } = await supabase.from('approval_gates')
        .update({ status: kind, decided_at: new Date().toISOString(), decided_by: profile?.id })
        .eq('id', gate.id).select('*').single()
      if (error) { toast.error('Could not update the approval gate.'); return }
      setGates(g => g.map(x => x.id === data.id ? data : x))
    }

    const { data: fb, error: fbError } = await supabase.from('approval_feedback')
      .insert({ gate_id: gate.id, author_id: profile?.id, body: text, kind })
      .select('*').single()
    if (fbError) { toast.error('Could not post your feedback.'); return }
    setGateFeedback(f => [...f, fb])
    toast.success('Posted to the segment channel.')
  }

  // ── Drag and drop ──
  // Subtasks and approval gates share one ordered list per milestone, so the
  // drag handlers look items up in both tables.
  function findItem(itemId) {
    const task = subtasks.find(t => t.id === itemId)
    if (task) return { kind: 'subtask', item: task }
    const gate = gates.find(g => g.id === itemId)
    if (gate) return { kind: 'gate', item: gate }
    return null
  }

  function findContainer(itemId) {
    const found = findItem(itemId)
    if (!found) return null
    return found.item.milestone_id ? `milestone-${found.item.milestone_id}` : 'ungrouped'
  }

  function containerMilestoneId(container) {
    if (!container || container === 'ungrouped') return null
    return container.startsWith('milestone-') ? container.replace('milestone-', '') : null
  }

  function handleDragStart({ active }) { setActiveId(active.id) }

  function handleDragOver({ active, over }) {
    if (!over) { setOverId(null); return }
    setOverId(over.id)
    const found = findItem(active.id)
    if (!found) return
    const activeContainer = findContainer(active.id)
    const overContainer = findItem(over.id) ? findContainer(over.id) : over.id
    if (activeContainer === overContainer) return
    const milestoneId = containerMilestoneId(overContainer)
    const move = list => list.map(x => x.id === active.id ? { ...x, milestone_id: milestoneId } : x)
    if (found.kind === 'gate') setGates(move)
    else setSubtasks(move)
  }

  async function handleDragEnd({ active, over }) {
    setActiveId(null); setOverId(null)
    if (!over || !findItem(active.id)) return

    const overContainer = findItem(over.id) ? findContainer(over.id) : over.id
    const milestoneId = containerMilestoneId(overContainer)

    // State already reflects any cross-list move made during dragOver.
    let list = orderedItems(milestoneId)
    const oldIdx = list.findIndex(i => i.id === active.id)
    const newIdx = list.findIndex(i => i.id === over.id)
    if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) list = arrayMove(list, oldIdx, newIdx)

    const positions = new Map(list.map((i, idx) => [i.id, idx]))
    const applyPosition = x => positions.has(x.id)
      ? { ...x, position: positions.get(x.id), milestone_id: milestoneId }
      : x
    setSubtasks(s => s.map(applyPosition))
    setGates(g => g.map(applyPosition))

    await Promise.all(list.map((i, idx) =>
      supabase.from(i.kind === 'gate' ? 'approval_gates' : 'subtasks')
        .update({ position: idx, milestone_id: milestoneId }).eq('id', i.id)
    ))
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

  async function sendToPublicCms() {
    if (!isExec || !seg) return

    setHandoffSaving(true)
    setHandoffMessage('')

    const credits = buildPublicCredits(roles)
    const byline = credits.map(credit => credit.name).filter(Boolean).join(', ')
    const segmentTitle = seg.title || 'Untitled segment'

    try {
      const { data: existingRows, error: lookupError } = await supabase
        .from('videos')
        .select('*')
        .eq('segment_id', id)
        .limit(1)

      if (lookupError) throw lookupError

      const existing = existingRows?.[0]
      let result

      if (existing) {
        const isDraftLike = !existing.published && (existing.upload_status === 'planned' || existing.href === '#pending-upload' || existing.publish_status === 'draft')
        const updatePayload = {
          segment_id: id,
          segment_title: segmentTitle,
          credits,
          byline: byline || existing.byline || '',
        }

        if (isDraftLike) {
          updatePayload.title = segmentTitle
          updatePayload.section = seg.section || existing.section || 'catalog'
          updatePayload.href = existing.href || '#pending-upload'
          updatePayload.upload_status = existing.upload_status || 'planned'
          updatePayload.publish_status = existing.publish_status || 'draft'
          updatePayload.published = false
          updatePayload.placements = Array.isArray(existing.placements) ? existing.placements : []
        }

        const { data, error } = await supabase
          .from('videos')
          .update(updatePayload)
          .eq('id', existing.id)
          .select('*')
          .single()

        if (error) throw error
        result = data
        setHandoffMessage('Public draft updated')
      } else {
        const insertPayload = {
          segment_id: id,
          segment_title: segmentTitle,
          title: segmentTitle,
          section: seg.section || 'catalog',
          href: '#pending-upload',
          upload_status: 'planned',
          publish_status: 'draft',
          published: false,
          placements: [],
          credits,
          byline,
        }

        const { data, error } = await supabase
          .from('videos')
          .insert(insertPayload)
          .select('*')
          .single()

        if (error) throw error
        result = data
        setHandoffMessage('Public draft created')
      }

      setPublicVideo(result)
    } catch (error) {
      console.error(error)
      setHandoffMessage(error.message || 'Could not send this segment to the Public CMS')
    } finally {
      setHandoffSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-24"><Spinner size={8} /></div>
  if (loadError) return <ErrorState message="Could not load this segment." onRetry={fetchAll} />
  if (!seg)    return <p className="text-gray-400">Segment not found.</p>

  const permanentRoles   = roles.filter(r => !r.is_guest)
  const guestRoles       = roles.filter(r => r.is_guest)
  const segmentMemberIds = [...new Set(roles.map(r => r.user_id))]
  const segmentMembers   = members.filter(m => segmentMemberIds.includes(m.id))

  // Subtasks and gates interleave in one ordered list per milestone. A gate
  // that is not yet approved blocks every subtask below it in that list.
  function orderedItems(milestoneId) {
    const rows = [
      ...subtasks.filter(t => (t.milestone_id ?? null) === (milestoneId ?? null)).map(t => ({ ...t, kind: 'subtask' })),
      ...gates.filter(g => (g.milestone_id ?? null) === (milestoneId ?? null)).map(g => ({ ...g, kind: 'gate' })),
    ].sort((a, b) =>
      (a.position ?? 0) - (b.position ?? 0) ||
      new Date(a.created_at) - new Date(b.created_at)
    )

    let blocker = null
    return rows.map(row => {
      if (row.kind === 'gate') {
        const next = { ...row, blockedBy: blocker }
        if (row.status !== 'approved') blocker = blocker ?? row
        return next
      }
      return { ...row, blockedBy: blocker }
    })
  }

  const ungroupedItems   = orderedItems(null)
  const completedCount   = subtasks.filter(t => t.completed).length
  const activeTask       = activeId ? subtasks.find(t => t.id === activeId) : null
  const activeGate       = activeId ? gates.find(g => g.id === activeId) : null
  const today            = new Date()
  const overdueCount     = subtasks.filter(t => t.due_date && !t.completed && isBefore(new Date(t.due_date), today) && !isToday(new Date(t.due_date))).length
  const publicStatus     = publicVideoStatus(publicVideo)
  const publicCmsEditUrl = publicVideo ? `${PUBLIC_CMS_VIDEO_URL}?edit=${publicVideo.id}` : PUBLIC_CMS_VIDEO_URL
  const publicStoryUrl   = publicVideo ? `${PUBLIC_STORY_URL}/${publicVideo.id}/${slugify(publicVideo.title || seg.title)}` : ''

  const renderRow = row => row.kind === 'gate' ? (
    <ApprovalGateRow key={row.id} gate={row}
      feedbackCount={gateFeedback.filter(f => f.gate_id === row.id).length}
      members={members} profileId={profile?.id} isExec={isExec} canEdit={canEdit}
      highlighted={row.id === highlightGateId}
      onApprove={approveGate}
      onRequestChanges={gate => setFeedbackModal({ gate, kind: 'changes_requested' })}
      onComments={gate => setFeedbackModal({ gate, kind: 'comment' })}
      onEdit={gate => setGateModal({ gate })}
      onDelete={deleteGate} />
  ) : (
    <SortableSubtaskRow key={row.id} task={row} segmentMembers={segmentMembers}
      onToggle={toggleSubtask} onDelete={deleteSubtask} onAssign={assignSubtask}
      onDateChange={updateSubtaskDate} onRename={renameSubtask}
      canEdit={canEdit} profileId={profile?.id} isExec={isExec} onSubmitClick={setSubmitTask}
      highlighted={row.id === highlightId} blockedBy={row.blockedBy} />
  )

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

        <div className="mt-5 pt-5 border-t border-gray-800">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Public Publishing CMS</p>
                <span className={`badge ${publicStatus.className}`}>{publicStatus.label}</span>
              </div>
              <p className="text-sm text-gray-400 mt-2 max-w-2xl">
                Send this segment when it is ready to become a public website draft. Production tasks stay here; public video URL, thumbnail, credits, placement, and SEO are finished in the Public CMS.
              </p>
              {publicVideo && (
                <p className="text-xs text-gray-600 mt-2">
                  Linked by segment ID: <span className="text-gray-400">{publicVideo.segment_id}</span>
                </p>
              )}
              {handoffMessage && (
                <p className={`text-xs mt-2 ${handoffMessage.toLowerCase().includes('could not') ? 'text-red-400' : 'text-green-400'}`}>
                  {handoffMessage}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {isExec && (
                <button
                  type="button"
                  onClick={sendToPublicCms}
                  disabled={handoffSaving}
                  className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5 disabled:opacity-60"
                >
                  {handoffSaving ? <Spinner size={3} /> : <Link2 size={13} />}
                  {publicVideo ? 'Sync Public CMS Draft' : 'Send to Public CMS'}
                </button>
              )}
              {publicVideo && (
                <a
                  href={publicCmsEditUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-700"
                >
                  Open in Public CMS <ExternalLink size={12} />
                </a>
              )}
              {publicVideo?.published && (
                <a
                  href={publicStoryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-700"
                >
                  View public story <ExternalLink size={12} />
                </a>
              )}
            </div>
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
                items={orderedItems(m.id)} renderRow={renderRow}
                onDeleteMilestone={deleteMilestone} onRename={renameMilestone} onAddSubtask={addSubtask}
                onAddGate={milestoneId => setGateModal({ gate: null, milestoneId })}
                canEdit={canEdit} isExec={isExec}
                isOver={overId === `milestone-${m.id}`} />
            ))}
            <div className={`card p-5 mb-4 transition-colors ${overId === 'ungrouped' ? 'border-brand-500/50 bg-brand-950/10' : ''}`}>
              {milestones.length > 0 && <p className="text-xs text-gray-600 font-medium mb-3 uppercase tracking-wider">Ungrouped</p>}
              <MilestoneDropZone id="ungrouped" isOver={overId === 'ungrouped'}>
                <SortableContext items={ungroupedItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                  {ungroupedItems.length === 0 && milestones.length > 0 && <p className="text-xs text-gray-700 py-2 text-center">Drop subtasks here to ungroup them</p>}
                  {ungroupedItems.length === 0 && milestones.length === 0 && <p className="text-gray-500 text-sm mb-3">No subtasks yet.</p>}
                  {ungroupedItems.map(renderRow)}
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
                  <button className="btn-ghost px-3 border border-gray-700" title="Add approval gate"
                    onClick={() => setGateModal({ gate: null, milestoneId: null })}>
                    <ShieldCheck size={15} className="text-brand-400" />
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
          <DragOverlay>
            {activeTask && <StaticSubtaskRow task={activeTask} />}
            {activeGate && (
              <div className="flex items-center gap-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg px-3 shadow-xl">
                <GripVertical size={14} className="text-gray-500" />
                <ShieldCheck size={14} className="text-brand-400" />
                <span className="text-sm text-gray-100 font-medium">{activeGate.title}</span>
              </div>
            )}
          </DragOverlay>
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

      {gateModal && (
        <ApprovalGateModal open onClose={() => setGateModal(null)}
          gate={gateModal.gate} members={segmentMembers.length ? segmentMembers : members}
          milestones={milestones} defaultMilestoneId={gateModal.milestoneId ?? null}
          onSave={saveGate} />
      )}

      {feedbackModal && (
        <ApprovalFeedbackModal open onClose={() => setFeedbackModal(null)}
          gate={feedbackModal.gate} kind={feedbackModal.kind}
          feedback={gateFeedback.filter(f => f.gate_id === feedbackModal.gate.id)}
          members={members} segmentTitle={seg.title}
          onSubmit={body => submitGateFeedback(feedbackModal.gate, feedbackModal.kind, body)} />
      )}
    </div>
  )
}
