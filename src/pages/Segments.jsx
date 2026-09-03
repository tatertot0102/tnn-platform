import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PriorityBadge, StatusBadge, DeptBadge } from '../components/ui/Badge'
import PageHeader from '../components/ui/PageHeader'
import Modal from '../components/ui/Modal'
import Spinner from '../components/ui/Spinner'
import ErrorState from '../components/ui/ErrorState'
import { useToast } from '../context/ToastContext'
import { PRIORITIES, STATUSES, DEPARTMENTS } from '../lib/constants'
import { format } from 'date-fns'
import { Plus, Search, Trash2 } from 'lucide-react'

const DEFAULT_MILESTONES = ['Pre-Production', 'Production', 'Post-Production']

function CreateSegmentModal({ open, onClose, onCreated }) {
  const { profile } = useAuth()
  const [form, setForm] = useState({
    title: '', priority: 'medium', status: 'not-started',
    departments: [], start_date: '', due_date: '', notes: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const toggleDept = (d) => set('departments',
    form.departments.includes(d) ? form.departments.filter(x => x !== d) : [...form.departments, d]
  )

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }
    setLoading(true)
    const { data: seg, error: segErr } = await supabase.from('segments').insert({
      ...form, created_by: profile.id,
      start_date: form.start_date || null,
      due_date:   form.due_date   || null,
    }).select().single()

    if (segErr) { setError(segErr.message); setLoading(false); return }

    // Insert 3 default milestones
    await supabase.from('milestones').insert(
      DEFAULT_MILESTONES.map((title, i) => ({ segment_id: seg.id, title, position: i }))
    )

    setLoading(false)
    setForm({ title: '', priority: 'medium', status: 'not-started', departments: [], start_date: '', due_date: '', notes: '' })
    onCreated()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="New Segment" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Title *</label>
          <input className="input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="Segment title..." />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Priority</label>
            <select className="input" value={form.priority} onChange={e => set('priority', e.target.value)}>
              {Object.entries(PRIORITIES).map(([v, p]) => <option key={v} value={v}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Status</label>
            <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
              {Object.entries(STATUSES).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Start Date</label>
            <input className="input" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Due Date</label>
            <input className="input" type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-2">Departments</label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(DEPARTMENTS).map(([v, d]) => (
              <button key={v} type="button" onClick={() => toggleDept(v)}
                className={`badge cursor-pointer transition-opacity ${d.color} ${form.departments.includes(v) ? 'opacity-100 ring-1 ring-white/20' : 'opacity-40'}`}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Notes</label>
          <textarea className="input resize-none" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Instructions..." />
        </div>
        <p className="text-xs text-gray-600">3 default milestones (Pre-Production, Production, Post-Production) will be created automatically.</p>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
            {loading && <Spinner size={4} />} Create Segment
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function Segments() {
  const { isExec } = useAuth()
  const toast = useToast()
  const [segments, setSegments]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState(false)
  const [search, setSearch]         = useState('')
  const [filterStatus, setFilterStatus]     = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => { fetchSegments() }, [])

  async function fetchSegments() {
    setLoading(true)
    setLoadError(false)
    const { data, error } = await supabase
      .from('segments')
      .select('*, segment_roles(user_id, role_type, profiles(full_name))')
      .order('due_date', { ascending: true })
    if (error) { setLoadError(true); setLoading(false); return }
    setSegments(data ?? [])
    setLoading(false)
  }

  async function deleteSegment(id) {
    if (!confirm('Delete this segment? All subtasks, roles, and milestones will be deleted. This cannot be undone.')) return
    setDeletingId(id)
    const { error } = await supabase.from('segments').delete().eq('id', id)
    if (error) { toast.error('Could not delete segment.'); setDeletingId(null); return }
    setSegments(s => s.filter(x => x.id !== id))
    setDeletingId(null)
  }

  const filtered = segments.filter(s => {
    if (search && !s.title.toLowerCase().includes(search.toLowerCase())) return false
    if (filterStatus   && s.status   !== filterStatus)   return false
    if (filterPriority && s.priority !== filterPriority) return false
    return true
  })

  return (
    <div>
      <PageHeader
        title="Segments"
        subtitle={`${segments.length} total`}
        actions={isExec && (
          <button className="btn-primary flex items-center gap-2" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> New Segment
          </button>
        )}
      />
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input className="input pl-8" placeholder="Search segments..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(STATUSES).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
        </select>
        <select className="input w-auto" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
          <option value="">All priorities</option>
          {Object.entries(PRIORITIES).map(([v, p]) => <option key={v} value={v}>{p.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={8} /></div>
      ) : loadError ? (
        <ErrorState message="Could not load segments." onRetry={fetchSegments} />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Priority', 'Title', 'Status', 'Departments', 'Team', 'Due Date', ''].map((h, i) => (
                  <th key={i} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 first:pl-5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center text-gray-500 py-12">No segments found</td></tr>
              )}
              {filtered.map(seg => (
                <tr key={seg.id} className="hover:bg-gray-800/40 transition-colors group">
                  <td className="px-4 py-3 pl-5"><PriorityBadge value={seg.priority} /></td>
                  <td className="px-4 py-3">
                    <Link to={`/segments/${seg.id}`} className="text-gray-100 font-medium hover:text-brand-400 transition-colors">
                      {seg.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3"><StatusBadge value={seg.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {seg.departments?.map(d => <DeptBadge key={d} value={d} />)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex -space-x-1">
                      {[...new Map(seg.segment_roles?.map(r => [r.user_id, r])).values()].slice(0, 4).map((r, i) => (
                        <div key={i} title={r.profiles?.full_name}
                          className="w-6 h-6 rounded-full bg-brand-600 border-2 border-gray-900 flex items-center justify-center text-xs text-white font-bold">
                          {r.profiles?.full_name?.[0] ?? '?'}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {seg.due_date ? format(new Date(seg.due_date), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {isExec && (
                      <button onClick={() => deleteSegment(seg.id)} disabled={deletingId === seg.id}
                        className="text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100" title="Delete">
                        {deletingId === seg.id ? <Spinner size={4} /> : <Trash2 size={14} />}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateSegmentModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={fetchSegments} />
    </div>
  )
}