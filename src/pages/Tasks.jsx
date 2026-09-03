import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PriorityBadge, DeptBadge } from '../components/ui/Badge'
import PageHeader from '../components/ui/PageHeader'
import Modal from '../components/ui/Modal'
import Spinner from '../components/ui/Spinner'
import { PRIORITIES, STATUSES, DEPARTMENTS } from '../lib/constants'
import { format, isPast, isToday } from 'date-fns'

import {
  Plus, Check, Trash2, ExternalLink, Link2, Pencil,
  ChevronDown, ChevronRight, CalendarClock, Inbox, Lock, CornerDownRight,
} from 'lucide-react'

function normalizeExternalUrl(url) {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

const PRIORITY_RING = {
  'ultra-high': 'border-red-500 hover:border-red-400',
  'high': 'border-orange-500 hover:border-orange-400',
  'medium': 'border-yellow-500 hover:border-yellow-400',
  'low': 'border-green-500 hover:border-green-400',
  'tbd': 'border-gray-600 hover:border-gray-400',
}

const PRIORITY_STRIPE = {
  'ultra-high': 'bg-red-500',
  'high': 'bg-orange-500',
  'medium': 'bg-yellow-500',
  'low': 'bg-green-500',
  'tbd': 'bg-gray-600',
}

function dueSection(dueDate) {
  if (!dueDate) return 'no-date'
  const d = new Date(dueDate)
  if (isToday(d)) return 'today'
  if (isPast(d)) return 'overdue'
  return 'upcoming'
}

const SECTION_META = {
  overdue:  { label: 'Overdue',  className: 'text-red-400',    accent: 'bg-red-500/70' },
  today:    { label: 'Today',    className: 'text-brand-300',  accent: 'bg-brand-500/70' },
  upcoming: { label: 'Upcoming', className: 'text-gray-200',   accent: 'bg-gray-600' },
  'no-date':{ label: 'No Date',  className: 'text-gray-500',   accent: 'bg-gray-700' },
}
const SECTION_ORDER = ['overdue', 'today', 'upcoming', 'no-date']

function TaskForm({ onSave, initial, onCancel, members, topLevelTasks, isExec, defaultParentId = null }) {
  const [form, setForm] = useState(initial ?? {
    title: '',
    priority: 'medium',
    status: 'not-started',
    department: '',
    due_date: '',
    notes: '',
    assignee_ids: [],
    link_url: '',
    parent_task_id: defaultParentId,
    exec_only: false,
  })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    await onSave({
      ...form,
      due_date: form.due_date || null,
      link_url: normalizeExternalUrl(form.link_url),
      parent_task_id: form.parent_task_id || null,
    })
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Title *</label>
        <input
          className="input"
          value={form.title}
          onChange={e => set('title', e.target.value)}
          placeholder="Task title..."
          required
        />
      </div>

      {topLevelTasks.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Sub-task of</label>
          <select className="input" value={form.parent_task_id ?? ''} onChange={e => set('parent_task_id', e.target.value || null)}>
            <option value="">None — standalone task</option>
            {topLevelTasks.map(t => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Priority</label>
          <select className="input" value={form.priority} onChange={e => set('priority', e.target.value)}>
            {Object.entries(PRIORITIES).map(([v, p]) => (
              <option key={v} value={v}>{p.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Status</label>
          <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
            {Object.entries(STATUSES).map(([v, s]) => (
              <option key={v} value={v}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Department</label>
          <select className="input" value={form.department} onChange={e => set('department', e.target.value)}>
            <option value="">None</option>
            {Object.entries(DEPARTMENTS).map(([v, d]) => (
              <option key={v} value={v}>{d.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Due Date</label>
          <input
            className="input"
            type="date"
            value={form.due_date}
            onChange={e => set('due_date', e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Link</label>
        <input
          className="input"
          value={form.link_url ?? ''}
          onChange={e => set('link_url', e.target.value)}
          placeholder="https://..."
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Assignees</label>
        <div className="flex flex-wrap gap-2 p-2 bg-gray-800 rounded-lg min-h-10">
          {members.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => set(
                'assignee_ids',
                form.assignee_ids.includes(m.id)
                  ? form.assignee_ids.filter(x => x !== m.id)
                  : [...form.assignee_ids, m.id]
              )}
              className={`text-xs px-2 py-1 rounded-md transition-colors ${
                form.assignee_ids.includes(m.id)
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:text-gray-200'
              }`}
            >
              {m.full_name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Notes</label>
        <textarea
          className="input resize-none"
          rows={2}
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
        />
      </div>

      {isExec && (
        <label className="flex items-center gap-2.5 px-1 cursor-pointer select-none">
          <input
            type="checkbox"
            className="accent-brand-400"
            checked={!!form.exec_only}
            onChange={e => set('exec_only', e.target.checked)}
          />
          <span className="text-sm text-gray-300 flex items-center gap-1.5">
            <Lock size={13} className="text-gray-500" /> Only visible to execs
          </span>
        </label>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>
        <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
          {loading && <Spinner size={4} />} Save Task
        </button>
      </div>
    </form>
  )
}

function TaskLinkModal({ open, onClose, task, onSave }) {
  const [url, setUrl] = useState(task?.link_url ?? '')

  useEffect(() => {
    setUrl(task?.link_url ?? '')
  }, [task])

  function handleSave() {
    onSave(task.id, normalizeExternalUrl(url))
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Update Task Link" size="sm">
      <div className="space-y-4">
        <p className="text-xs text-gray-500">Add or update a link for this task.</p>
        <input
          className="input"
          placeholder="https://..."
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          autoFocus
        />
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleSave} className="btn-primary">Save Link</button>
        </div>
      </div>
    </Modal>
  )
}

function TaskRow({ task, members, canEdit, isExec, isSubtask, onToggle, onEdit, onLink, onDelete, highlighted }) {
  const isOverdue = task.due_date && task.status !== 'done' && isPast(new Date(task.due_date)) && !isToday(new Date(task.due_date))
  const assigneeNames = task.assignee_ids?.map(id => members.find(m => m.id === id)?.full_name).filter(Boolean) ?? []

  return (
    <div
      id={`task-${task.id}`}
      className={`flex items-center gap-3 group py-2.5 transition-colors ${
        isSubtask
          ? 'pl-9 pr-3 border-t border-gray-800/60'
          : 'px-4'
      } ${highlighted ? 'bg-brand-950/40 ring-1 ring-inset ring-brand-500/60 rounded-lg' : ''}`}
    >
      {isSubtask && <CornerDownRight size={13} className="text-gray-700 flex-shrink-0 -ml-6" />}
      <button
        onClick={() => canEdit && onToggle(task)}
        className={`rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${isSubtask ? 'w-4 h-4' : 'w-5 h-5'} ${
          task.status === 'done' ? 'bg-brand-500 border-brand-500' : `${PRIORITY_RING[task.priority] ?? PRIORITY_RING.tbd}`
        } ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
      >
        {task.status === 'done' && <Check size={isSubtask ? 9 : 11} className="text-white" />}
      </button>

      <div className="flex-1 min-w-0">
        <p className={`font-medium truncate ${isSubtask ? 'text-sm' : 'text-[15px]'} ${task.status === 'done' ? 'text-gray-600 line-through' : 'text-gray-100'}`}>
          {task.title}
          {task.exec_only && <Lock size={11} className="inline-block ml-1.5 mb-0.5 text-gray-600" />}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {task.due_date && (
            <span className={`flex items-center gap-1 text-xs ${isOverdue ? 'text-red-400 font-medium' : 'text-gray-500'}`}>
              <CalendarClock size={11} /> {format(new Date(task.due_date), 'MMM d')}
            </span>
          )}
          {task.department && <DeptBadge value={task.department} />}
          {assigneeNames.length > 0 && (
            <span className="text-xs text-gray-500">{assigneeNames.join(', ')}</span>
          )}
        </div>
        {task.link_url && (
          <a
            href={normalizeExternalUrl(task.link_url)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 mt-1.5 transition-colors"
          >
            <Link2 size={12} /> Open Link <ExternalLink size={11} />
          </a>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {!isSubtask && <PriorityBadge value={task.priority} />}
        {!isSubtask && (
          <span className="hidden sm:flex items-center gap-1 text-xs text-gray-600">
            <Inbox size={11} /> Inbox
          </span>
        )}
        {canEdit && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onEdit(task)} className="btn-ghost text-xs px-2 py-1">Edit</button>
            <button onClick={() => onLink(task)} className="btn-ghost text-xs px-2 py-1 flex items-center gap-1">
              <Pencil size={12} /> {task.link_url ? 'Edit Link' : 'Add Link'}
            </button>
            {isExec && (
              <button onClick={() => onDelete(task.id)} className="text-gray-600 hover:text-red-400 transition-colors px-1">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Tasks() {
  const { isExec, profile } = useAuth()
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('highlight')
  const [tasks, setTasks] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [subtaskParent, setSubtaskParent] = useState(null)
  const [editing, setEditing] = useState(null)
  const [linkEditing, setLinkEditing] = useState(null)
  const [collapsed, setCollapsed] = useState({})
  const [rescheduling, setRescheduling] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [newSubtaskFor, setNewSubtaskFor] = useState(null)
  const [subtaskTitle, setSubtaskTitle] = useState('')

  useEffect(() => { fetchAll() }, [profile])

  useEffect(() => {
    if (!highlightId || loading) return
    document.getElementById(`task-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightId, loading, tasks])

  async function fetchAll() {
    if (!profile) return
    setLoading(true)

    const [{ data: taskData }, { data: memberData }] = await Promise.all([
      isExec
        ? supabase.from('tasks').select('*').order('due_date', { ascending: true })
        : supabase.from('tasks').select('*')
            .contains('assignee_ids', [profile.id])
            .order('due_date', { ascending: true }),
      supabase.from('profiles').select('id, full_name'),
    ])

    setTasks(taskData ?? [])
    setMembers(memberData ?? [])
    setLoading(false)
  }

  async function createTask(form) {
    const { data } = await supabase
      .from('tasks')
      .insert({ ...form, created_by: profile.id })
      .select()
      .single()

    setTasks(t => [...t, data])
    setShowCreate(false)
    setSubtaskParent(null)
  }

  async function updateTask(id, form) {
    const { data } = await supabase
      .from('tasks')
      .update(form)
      .eq('id', id)
      .select()
      .single()

    setTasks(t => t.map(x => x.id === id ? data : x))
    setEditing(null)
  }

  async function updateTaskLink(id, link_url) {
    const { data } = await supabase
      .from('tasks')
      .update({ link_url })
      .eq('id', id)
      .select()
      .single()

    setTasks(t => t.map(x => x.id === id ? data : x))
  }

  async function deleteTask(id) {
    if (!confirm('Delete this task? Sub-tasks will be deleted too.')) return
    await supabase.from('tasks').delete().eq('id', id)
    setTasks(t => t.filter(x => x.id !== id && x.parent_task_id !== id))
  }

  async function toggleDone(task) {
    const canEdit = isExec || task.assignee_ids?.includes(profile.id)
    if (!canEdit) return

    const newStatus = task.status === 'done' ? 'not-started' : 'done'
    await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id)
    setTasks(t => t.map(x => x.id === task.id ? { ...x, status: newStatus } : x))
  }

  async function addQuickSubtask(parent) {
    if (!subtaskTitle.trim()) return
    const { data } = await supabase.from('tasks').insert({
      title: subtaskTitle.trim(),
      priority: parent.priority,
      status: 'not-started',
      department: parent.department,
      assignee_ids: parent.assignee_ids ?? [],
      parent_task_id: parent.id,
      exec_only: parent.exec_only,
      created_by: profile.id,
    }).select().single()
    setTasks(t => [...t, data])
    setSubtaskTitle('')
    setNewSubtaskFor(null)
  }

  async function handleRescheduleOverdue() {
    if (!rescheduleDate) return
    const overdueTop = topLevel.filter(t => t.status !== 'done' && dueSection(t.due_date) === 'overdue')
    await Promise.all(overdueTop.map(t => supabase.from('tasks').update({ due_date: rescheduleDate }).eq('id', t.id)))
    setTasks(t => t.map(x => overdueTop.find(o => o.id === x.id) ? { ...x, due_date: rescheduleDate } : x))
    setRescheduling(false)
    setRescheduleDate('')
  }

  const topLevel = useMemo(() => tasks.filter(t => !t.parent_task_id), [tasks])
  const childrenOf = (id) => tasks.filter(t => t.parent_task_id === id)

  if (loading) return <div className="flex justify-center py-24"><Spinner size={8} /></div>

  const openTop = topLevel.filter(t => t.status !== 'done')
  const doneTop = topLevel.filter(t => t.status === 'done')

  const grouped = SECTION_ORDER.reduce((acc, key) => {
    acc[key] = openTop.filter(t => dueSection(t.due_date) === key)
    return acc
  }, {})

  const totalOpen = openTop.length

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle={isExec ? `All standalone tasks · ${totalOpen} open` : `Tasks assigned to you · ${totalOpen} open`}
        actions={(
          <button className="btn-primary flex items-center gap-2" onClick={() => { setSubtaskParent(null); setShowCreate(true) }}>
            <Plus size={16} /> New Task
          </button>
        )}
      />

      <div className="space-y-6">
        {SECTION_ORDER.map(key => {
          const items = grouped[key]
          if (items.length === 0) return null
          const meta = SECTION_META[key]
          const isCollapsed = collapsed[key]

          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-2.5 px-1">
                <button
                  onClick={() => setCollapsed(c => ({ ...c, [key]: !c[key] }))}
                  className="flex items-center gap-2 text-sm font-semibold"
                >
                  <span className={`w-1 h-4 rounded-full ${meta.accent}`} />
                  {isCollapsed ? <ChevronRight size={15} className="text-gray-500" /> : <ChevronDown size={15} className="text-gray-500" />}
                  <span className={meta.className}>{meta.label}</span>
                  <span className="text-xs text-gray-600 font-normal">({items.length})</span>
                </button>
                {key === 'overdue' && isExec && (
                  <button
                    onClick={() => setRescheduling(r => !r)}
                    className="flex items-center gap-1 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-950/40 px-2 py-1 rounded-md transition-colors"
                  >
                    <CalendarClock size={12} /> Reschedule all
                  </button>
                )}
              </div>

              {key === 'overdue' && rescheduling && (
                <div className="flex items-center gap-2 mb-3 px-1">
                  <input type="date" className="input w-auto text-xs" value={rescheduleDate} onChange={e => setRescheduleDate(e.target.value)} />
                  <button onClick={handleRescheduleOverdue} className="btn-primary text-xs px-3 py-1.5">Apply to all overdue</button>
                  <button onClick={() => setRescheduling(false)} className="btn-ghost text-xs px-2 py-1.5">Cancel</button>
                </div>
              )}

              {!isCollapsed && (
                <div className="space-y-2">
                  {items.map(task => {
                    const canEdit = isExec || task.assignee_ids?.includes(profile.id)
                    const kids = childrenOf(task.id)
                    return (
                      <div
                        key={task.id}
                        className={`relative overflow-hidden card transition-shadow hover:shadow-lg hover:shadow-black/20 hover:border-gray-700`}
                      >
                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${PRIORITY_STRIPE[task.priority] ?? PRIORITY_STRIPE.tbd}`} />
                        <TaskRow
                          task={task} members={members} canEdit={canEdit} isExec={isExec}
                          onToggle={toggleDone} onEdit={setEditing} onLink={setLinkEditing} onDelete={deleteTask}
                          highlighted={task.id === highlightId}
                        />
                        {kids.map(kid => (
                          <TaskRow
                            key={kid.id} task={kid} members={members} isSubtask
                            canEdit={isExec || kid.assignee_ids?.includes(profile.id)} isExec={isExec}
                            onToggle={toggleDone} onEdit={setEditing} onLink={setLinkEditing} onDelete={deleteTask}
                            highlighted={kid.id === highlightId}
                          />
                        ))}
                        {canEdit && (
                          newSubtaskFor === task.id ? (
                            <div className="flex items-center gap-2 pl-9 pr-4 py-2 border-t border-gray-800/60">
                              <input
                                autoFocus
                                className="input text-xs flex-1 py-1.5"
                                placeholder="Sub-task title..."
                                value={subtaskTitle}
                                onChange={e => setSubtaskTitle(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') addQuickSubtask(task)
                                  if (e.key === 'Escape') { setNewSubtaskFor(null); setSubtaskTitle('') }
                                }}
                              />
                              <button className="btn-primary text-xs px-2 py-1.5" onClick={() => addQuickSubtask(task)}>Add</button>
                              <button className="btn-ghost text-xs px-2 py-1.5" onClick={() => { setNewSubtaskFor(null); setSubtaskTitle('') }}>Cancel</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setNewSubtaskFor(task.id); setSubtaskTitle('') }}
                              className="flex items-center gap-1.5 pl-9 pr-4 py-1.5 text-xs text-gray-600 hover:text-brand-400 transition-colors border-t border-gray-800/60 w-full"
                            >
                              <Plus size={12} /> Add sub-task
                            </button>
                          )
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {totalOpen === 0 && <p className="text-gray-500 text-sm">No open tasks.</p>}
      </div>

      {doneTop.length > 0 && (
        <div className="mt-8">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">
            Completed ({doneTop.length})
          </p>
          <div className="space-y-1.5 opacity-60 hover:opacity-80 transition-opacity">
            {doneTop.map(task => (
              <div key={task.id} className="card">
                <TaskRow
                  task={task} members={members}
                  canEdit={isExec || task.assignee_ids?.includes(profile.id)} isExec={isExec}
                  onToggle={toggleDone} onEdit={setEditing} onLink={setLinkEditing} onDelete={deleteTask}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Task">
        <TaskForm
          onSave={createTask}
          onCancel={() => setShowCreate(false)}
          members={members}
          topLevelTasks={topLevel}
          isExec={isExec}
          defaultParentId={subtaskParent}
        />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Task">
        <TaskForm
          initial={editing}
          onSave={(f) => updateTask(editing.id, f)}
          onCancel={() => setEditing(null)}
          members={members}
          topLevelTasks={topLevel.filter(t => t.id !== editing?.id)}
          isExec={isExec}
        />
      </Modal>

      <TaskLinkModal
        open={!!linkEditing}
        onClose={() => setLinkEditing(null)}
        task={linkEditing}
        onSave={updateTaskLink}
      />
    </div>
  )
}
