import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PriorityBadge, StatusBadge, DeptBadge } from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import { PRIORITIES, STATUSES, DEPARTMENTS, PRIMARY_ROLES, SECONDARY_ROLES } from '../lib/constants'
import { format } from 'date-fns'
import { Plus, Trash2, Check, ArrowLeft, UserPlus } from 'lucide-react'

export default function SegmentDetail() {
  const { id }        = useParams()
  const { isExec, profile } = useAuth()
  const navigate      = useNavigate()
  const [seg, setSeg]           = useState(null)
  const [subtasks, setSubtasks] = useState([])
  const [roles, setRoles]       = useState([])
  const [members, setMembers]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [newSubtask, setNewSubtask] = useState('')
  const [activeTab, setActiveTab]   = useState('overview')

  useEffect(() => { fetchAll() }, [id])

  async function fetchAll() {
    setLoading(true)
    const [{ data: segment }, { data: subs }, { data: segRoles }, { data: allMembers }] = await Promise.all([
      supabase.from('segments').select('*').eq('id', id).single(),
      supabase.from('subtasks').select('*, profiles:assignee_id(full_name)').eq('segment_id', id).order('created_at'),
      supabase.from('segment_roles').select('*, profiles(full_name, id)').eq('segment_id', id),
      supabase.from('profiles').select('id, full_name, role'),
    ])
    setSeg(segment)
    setSubtasks(subs ?? [])
    setRoles(segRoles ?? [])
    setMembers(allMembers ?? [])
    setLoading(false)
  }

  async function updateSeg(field, value) {
    setSaving(true)
    await supabase.from('segments').update({ [field]: value }).eq('id', id)
    setSeg(s => ({ ...s, [field]: value }))
    setSaving(false)
  }

  async function addSubtask() {
    if (!newSubtask.trim()) return
    const { data } = await supabase.from('subtasks').insert({
      segment_id: id, title: newSubtask.trim(), completed: false,
    }).select().single()
    setSubtasks(s => [...s, data])
    setNewSubtask('')
  }

  async function toggleSubtask(subtaskId, completed) {
    await supabase.from('subtasks').update({ completed: !completed }).eq('id', subtaskId)
    setSubtasks(s => s.map(t => t.id === subtaskId ? { ...t, completed: !completed } : t))
  }

  async function deleteSubtask(subtaskId) {
    await supabase.from('subtasks').delete().eq('id', subtaskId)
    setSubtasks(s => s.filter(t => t.id !== subtaskId))
  }

  async function assignRole(roleType, userId) {
    const existing = roles.find(r => r.role_type === roleType)
    if (existing) {
      if (userId === '') {
        await supabase.from('segment_roles').delete().eq('id', existing.id)
        setRoles(r => r.filter(x => x.id !== existing.id))
      } else {
        await supabase.from('segment_roles').update({ user_id: userId }).eq('id', existing.id)
        setRoles(r => r.map(x => x.id === existing.id ? { ...x, user_id: userId, profiles: members.find(m => m.id === userId) } : x))
      }
    } else if (userId !== '') {
      const { data } = await supabase.from('segment_roles').insert({
        segment_id: id, user_id: userId, role_type: roleType,
      }).select('*, profiles(full_name, id)').single()
      setRoles(r => [...r, data])
    }
  }

  if (loading) return <div className="flex justify-center py-24"><Spinner size={8} /></div>
  if (!seg)    return <p className="text-gray-400">Segment not found.</p>

  const tabs = ['overview', 'subtasks', 'roles', 'notes']
  const completedCount = subtasks.filter(t => t.completed).length

  return (
    <div>
      {/* Back */}
      <button onClick={() => navigate('/segments')} className="flex items-center gap-1.5 text-gray-400 hover:text-gray-100 text-sm mb-6 transition-colors">
        <ArrowLeft size={15} /> Back to Segments
      </button>

      {/* Header */}
      <div className="card p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            {isExec ? (
              <input
                className="text-2xl font-bold text-white bg-transparent border-none outline-none w-full focus:bg-gray-800 rounded px-1 -ml-1 transition-colors"
                value={seg.title}
                onChange={e => setSeg(s => ({ ...s, title: e.target.value }))}
                onBlur={e => updateSeg('title', e.target.value)}
              />
            ) : (
              <h1 className="text-2xl font-bold text-white">{seg.title}</h1>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              {seg.departments?.map(d => <DeptBadge key={d} value={d} />)}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {saving && <Spinner size={4} />}
            {isExec ? (
              <>
                <select
                  className="input w-auto text-xs"
                  value={seg.priority}
                  onChange={e => updateSeg('priority', e.target.value)}
                >
                  {Object.entries(PRIORITIES).map(([v, p]) => <option key={v} value={v}>{p.label}</option>)}
                </select>
                <select
                  className="input w-auto text-xs"
                  value={seg.status}
                  onChange={e => updateSeg('status', e.target.value)}
                >
                  {Object.entries(STATUSES).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
                </select>
              </>
            ) : (
              <>
                <PriorityBadge value={seg.priority} />
                <StatusBadge value={seg.status} />
              </>
            )}
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 pt-5 border-t border-gray-800">
          {[
            { label: 'Start Date', field: 'start_date', type: 'date' },
            { label: 'Due Date',   field: 'due_date',   type: 'date' },
          ].map(({ label, field, type }) => (
            <div key={field}>
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              {isExec ? (
                <input
                  className="input text-xs"
                  type={type}
                  value={seg[field] ?? ''}
                  onChange={e => updateSeg(field, e.target.value || null)}
                />
              ) : (
                <p className="text-sm text-gray-200">{seg[field] ? format(new Date(seg[field]), 'MMM d, yyyy') : '—'}</p>
              )}
            </div>
          ))}
          <div>
            <p className="text-xs text-gray-500 mb-1">Subtasks</p>
            <p className="text-sm text-gray-200">{completedCount} / {subtasks.length} done</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Team</p>
            <p className="text-sm text-gray-200">{roles.length} assigned</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800 mb-6">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === t ? 'border-brand-400 text-brand-400' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
            {t === 'subtasks' && subtasks.length > 0 && (
              <span className="ml-1.5 badge bg-gray-800 text-gray-400">{subtasks.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">Roles</h3>
            <div className="space-y-3">
              {PRIMARY_ROLES.map(role => {
                const assigned = roles.find(r => r.role_type === role)
                return (
                  <div key={role} className="flex items-center justify-between">
                    <span className="text-xs text-gray-400 w-28 flex-shrink-0">{role}</span>
                    {isExec ? (
                      <select
                        className="input text-xs flex-1"
                        value={assigned?.user_id ?? ''}
                        onChange={e => assignRole(role, e.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                      </select>
                    ) : (
                      <span className="text-sm text-gray-200">{assigned?.profiles?.full_name ?? <span className="text-gray-600">Unassigned</span>}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Recent Subtasks</h3>
            {subtasks.length === 0 ? (
              <p className="text-gray-500 text-sm">No subtasks yet.</p>
            ) : (
              <div className="space-y-2">
                {subtasks.slice(0, 5).map(t => (
                  <div key={t.id} className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${t.completed ? 'bg-green-600 border-green-600' : 'border-gray-600'}`}>
                      {t.completed && <Check size={10} className="text-white" />}
                    </div>
                    <span className={`text-sm ${t.completed ? 'text-gray-600 line-through' : 'text-gray-200'}`}>{t.title}</span>
                  </div>
                ))}
                {subtasks.length > 5 && <button onClick={() => setActiveTab('subtasks')} className="text-xs text-brand-400 hover:underline">View all {subtasks.length}</button>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Subtasks */}
      {activeTab === 'subtasks' && (
        <div className="card p-6">
          <div className="flex gap-2 mb-5">
            <input
              className="input flex-1"
              placeholder="Add a subtask..."
              value={newSubtask}
              onChange={e => setNewSubtask(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSubtask()}
            />
            <button className="btn-primary flex items-center gap-2" onClick={addSubtask}>
              <Plus size={15} /> Add
            </button>
          </div>
          <div className="space-y-2">
            {subtasks.length === 0 && <p className="text-gray-500 text-sm">No subtasks yet.</p>}
            {subtasks.map(t => (
              <div key={t.id} className="flex items-center gap-3 group py-1">
                <button
                  onClick={() => toggleSubtask(t.id, t.completed)}
                  className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${t.completed ? 'bg-green-600 border-green-600' : 'border-gray-600 hover:border-green-500'}`}
                >
                  {t.completed && <Check size={11} className="text-white" />}
                </button>
                <span className={`flex-1 text-sm ${t.completed ? 'text-gray-600 line-through' : 'text-gray-200'}`}>{t.title}</span>
                {t.profiles?.full_name && <span className="text-xs text-gray-500">{t.profiles.full_name}</span>}
                <button
                  onClick={() => deleteSubtask(t.id)}
                  className="text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Roles */}
      {activeTab === 'roles' && (
        <div className="card p-6">
          <div className="space-y-6">
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Primary Roles</h3>
              <div className="space-y-3">
                {PRIMARY_ROLES.map(role => {
                  const assigned = roles.find(r => r.role_type === role)
                  return (
                    <div key={role} className="flex items-center gap-4 p-3 bg-gray-800/50 rounded-lg">
                      <span className="text-sm font-medium text-gray-200 w-36">{role}</span>
                      {isExec ? (
                        <select
                          className="input text-sm flex-1"
                          value={assigned?.user_id ?? ''}
                          onChange={e => assignRole(role, e.target.value)}
                        >
                          <option value="">Unassigned</option>
                          {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                        </select>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-xs font-bold text-white">
                            {assigned?.profiles?.full_name?.[0] ?? '?'}
                          </div>
                          <span className="text-sm text-gray-200">{assigned?.profiles?.full_name ?? 'Unassigned'}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Secondary Roles</h3>
              <div className="space-y-3">
                {SECONDARY_ROLES.map(role => {
                  const assigned = roles.find(r => r.role_type === role)
                  return (
                    <div key={role} className="flex items-center gap-4 p-3 bg-gray-800/30 rounded-lg">
                      <span className="text-sm text-gray-400 w-36">{role}</span>
                      {isExec ? (
                        <select
                          className="input text-sm flex-1"
                          value={assigned?.user_id ?? ''}
                          onChange={e => assignRole(role, e.target.value)}
                        >
                          <option value="">Unassigned</option>
                          {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                        </select>
                      ) : (
                        <span className="text-sm text-gray-300">{assigned?.profiles?.full_name ?? <span className="text-gray-600">Unassigned</span>}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Notes */}
      {activeTab === 'notes' && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Notes & Instructions</h3>
          {isExec ? (
            <textarea
              className="input resize-none w-full"
              rows={12}
              placeholder="Add notes, instructions, or context for the team..."
              value={seg.notes ?? ''}
              onChange={e => setSeg(s => ({ ...s, notes: e.target.value }))}
              onBlur={e => updateSeg('notes', e.target.value)}
            />
          ) : (
            <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
              {seg.notes || <span className="text-gray-600">No notes added.</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
