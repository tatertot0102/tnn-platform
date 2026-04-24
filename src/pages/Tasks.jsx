import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PriorityBadge, StatusBadge, DeptBadge } from '../components/ui/Badge'
import PageHeader from '../components/ui/PageHeader'
import Modal from '../components/ui/Modal'
import Spinner from '../components/ui/Spinner'
import { PRIORITIES, STATUSES, DEPARTMENTS } from '../lib/constants'
import { format } from 'date-fns'

import { Plus, Check, Trash2, ExternalLink, Link2, Pencil } from 'lucide-react'

function normalizeExternalUrl(url) {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function TaskForm({ onSave, initial, onCancel, members }) {
  const [form, setForm] = useState(initial ?? {
    title: '',
    priority: 'medium',
    status: 'not-started',
    department: '',
    due_date: '',
    notes: '',
    assignee_ids: [],
    link_url: '',
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

export default function Tasks() {
  const { isExec, profile } = useAuth()
  const [tasks, setTasks] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState(null)
  const [linkEditing, setLinkEditing] = useState(null)

  useEffect(() => { fetchAll() }, [profile])

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
    if (!confirm('Delete this task?')) return
    await supabase.from('tasks').delete().eq('id', id)
    setTasks(t => t.filter(x => x.id !== id))
  }

  async function toggleDone(task) {
    const canEdit = isExec || task.assignee_ids?.includes(profile.id)
    if (!canEdit) return

    const newStatus = task.status === 'done' ? 'not-started' : 'done'
    await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id)
    setTasks(t => t.map(x => x.id === task.id ? { ...x, status: newStatus } : x))
  }

  if (loading) return <div className="flex justify-center py-24"><Spinner size={8} /></div>

  const openTasks = tasks.filter(t => t.status !== 'done')
  const doneTasks = tasks.filter(t => t.status === 'done')

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle={isExec ? 'All standalone tasks' : 'Tasks assigned to you'}
        actions={(
          <button className="btn-primary flex items-center gap-2" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> New Task
          </button>
        )}
      />

      <div className="space-y-2">
        {openTasks.length === 0 && <p className="text-gray-500 text-sm">No open tasks.</p>}

        {openTasks.map(task => {
          const canEdit = isExec || task.assignee_ids?.includes(profile.id)

          return (
            <div key={task.id} className="card p-4 flex items-center gap-3 group hover:border-gray-700 transition-colors">
              <button
                onClick={() => toggleDone(task)}
                className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                  canEdit ? 'border-gray-600 hover:border-green-500 cursor-pointer' : 'border-gray-700 cursor-default'
                }`}
              />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-100">{task.title}</p>

                <div className="flex flex-wrap gap-1.5 mt-1">
                  {task.department && <DeptBadge value={task.department} />}
                  <span className="text-xs text-gray-500">
                    {task.assignee_ids?.map(id => members.find(m => m.id === id)?.full_name).filter(Boolean).join(', ')}
                  </span>
                </div>

                {task.link_url && (
                  <a
                    href={normalizeExternalUrl(task.link_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 mt-2 transition-colors"
                  >
                    <Link2 size={12} />
                    Open Link
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <PriorityBadge value={task.priority} />
                <StatusBadge value={task.status} />
                {task.due_date && (
                  <span className="text-xs text-gray-500">
                    {format(new Date(task.due_date), 'MMM d')}
                  </span>
                )}
                {canEdit && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setEditing(task)}
                      className="btn-ghost text-xs px-2 py-1"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setLinkEditing(task)}
                      className="btn-ghost text-xs px-2 py-1 flex items-center gap-1"
                    >
                      <Pencil size={12} />
                      {task.link_url ? 'Edit Link' : 'Add Link'}
                    </button>
                    {isExec && (
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="text-gray-600 hover:text-red-400 transition-colors px-1"
                        title="Delete task"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {doneTasks.length > 0 && (
        <div className="mt-8">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">
            Completed ({doneTasks.length})
          </p>
          <div className="space-y-2">
            {doneTasks.map(task => (
              <div
                key={task.id}
                className="card p-4 flex items-center gap-3 opacity-50 hover:opacity-70 transition-opacity"
              >
                <button
                  className="w-5 h-5 rounded border bg-green-600 border-green-600 flex items-center justify-center flex-shrink-0"
                  onClick={() => toggleDone(task)}
                  title="Mark as not done"
                >
                  <Check size={11} className="text-white" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-500 line-through">{task.title}</p>
                  {task.link_url && (
                    <a
                      href={normalizeExternalUrl(task.link_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 mt-1"
                    >
                      <Link2 size={12} />
                      Open Link
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>
                {(isExec || task.assignee_ids?.includes(profile.id)) && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => setEditing(task)}
                      className="btn-ghost text-xs px-2 py-1"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setLinkEditing(task)}
                      className="btn-ghost text-xs px-2 py-1 flex items-center gap-1"
                    >
                      <Pencil size={12} />
                      {task.link_url ? 'Edit Link' : 'Add Link'}
                    </button>
                    {isExec && (
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="text-gray-600 hover:text-red-400 transition-colors px-1"
                        title="Delete task"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
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
        />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Task">
        <TaskForm
          initial={editing}
          onSave={(f) => updateTask(editing.id, f)}
          onCancel={() => setEditing(null)}
          members={members}
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