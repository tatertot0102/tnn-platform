import { useState } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PriorityBadge, StatusBadge, DeptBadge } from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import ErrorState from '../components/ui/ErrorState'
import { PageSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../context/ToastContext'
import Modal from '../components/ui/Modal'
import { PRIORITIES, STATUSES, DEPARTMENTS, PRIMARY_ROLES, SECONDARY_ROLES } from '../lib/constants'
import SubtaskBoard from '../components/segments/subtasks/SubtaskBoard'
import { useSegmentWork } from '../hooks/useSegmentWork'
import { useMediaQuery, DESKTOP_QUERY } from '../hooks/useMediaQuery'
import { isOverdue } from '../lib/subtasks'
import { format } from 'date-fns'
import {
  Trash2, Check, ArrowLeft, ExternalLink,
  Plus, UserPlus, X, Flag, Link2, Maximize2
} from 'lucide-react'

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
          <input className="input sm:text-xs flex-1" placeholder="https://drive.google.com/..." value={val}
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

// ── Main ──────────────────────────────────────────────────────
export default function SegmentDetail() {
  const { id }              = useParams()
  const { isExec } = useAuth()
  const navigate            = useNavigate()
  const [searchParams]      = useSearchParams()

  const work = useSegmentWork(id)
  const { segment: seg, subtasks, milestones, roles, members, canEdit, isLoading, isError, refetch } = work
  const queryClient = useQueryClient()
  const toast = useToast()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [saving, setSaving]         = useState(false)
  const [activeTab, setActiveTab]   = useState(searchParams.get('tab') === 'subtasks' || searchParams.get('gate') ? 'subtasks' : 'overview')
  const [showGuestModal, setShowGuestModal]   = useState(false)
  const [handoffSaving, setHandoffSaving] = useState(false)
  const [handoffMessage, setHandoffMessage] = useState('')

  // Refreshes on window focus, so edits made in the Public CMS show up here.
  const publicVideoKey = ['segment', id, 'publicVideo']
  const { data: publicVideo = null } = useQuery({
    queryKey: publicVideoKey,
    queryFn: async () => {
      const { data, error } = await supabase.from('videos').select('*')
        .eq('segment_id', id).order('updated_at', { ascending: false }).limit(1)
      if (error) throw error
      return data?.[0] ?? null
    },
  })
  const setPublicVideo = video => queryClient.setQueryData(publicVideoKey, video)
  const setSeg = updater => work.patchSegmentLocal(updater(seg))

  // Phones get the full-screen subtasks page instead of a cramped tab.
  const forwarded = new URLSearchParams(searchParams)
  forwarded.delete('tab')
  const subtasksPath = `/segments/${id}/subtasks${forwarded.size ? `?${forwarded}` : ''}`
  function openTab(tab) {
    if (tab === 'subtasks' && !isDesktop) navigate(subtasksPath)
    else setActiveTab(tab)
  }

  async function updateSeg(field, value) {
    if (!canEdit) return
    setSaving(true)
    await work.updateSegment({ [field]: value })
    setSaving(false)
  }

  async function deleteSegment() {
    if (!isExec) return
    if (!confirm(`Delete "${seg.title}"? Cannot be undone.`)) return
    const { error } = await supabase.from('segments').delete().eq('id', id)
    if (error) { toast.error('Could not delete segment.'); return }
    navigate('/segments')
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

  if (isLoading) return <PageSkeleton />
  if (isError) return <ErrorState message="Could not load this segment." onRetry={refetch} />
  if (!seg)    return <p className="text-gray-400">Segment not found.</p>

  const permanentRoles   = roles.filter(r => !r.is_guest)
  const guestRoles       = roles.filter(r => r.is_guest)
  const completedCount   = subtasks.filter(t => t.completed).length
  const overdueCount     = subtasks.filter(t => isOverdue(t.due_date, t.completed)).length
  const publicStatus     = publicVideoStatus(publicVideo)
  const publicCmsEditUrl = publicVideo ? `${PUBLIC_CMS_VIDEO_URL}?edit=${publicVideo.id}` : PUBLIC_CMS_VIDEO_URL
  const publicStoryUrl   = publicVideo ? `${PUBLIC_STORY_URL}/${publicVideo.id}/${slugify(publicVideo.title || seg.title)}` : ''

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
          <div className="flex items-center gap-2 w-full sm:w-auto flex-shrink-0 flex-wrap justify-start sm:justify-end">
            {saving && <Spinner size={4} />}
            {isExec ? (
              <>
                <select className="input flex-1 sm:flex-none sm:w-auto sm:text-xs" aria-label="Priority" value={seg.priority} onChange={e => updateSeg('priority', e.target.value)}>
                  {Object.entries(PRIORITIES).map(([v, p]) => <option key={v} value={v}>{p.label}</option>)}
                </select>
                <select className="input flex-1 sm:flex-none sm:w-auto sm:text-xs" aria-label="Status" value={seg.status} onChange={e => updateSeg('status', e.target.value)}>
                  {Object.entries(STATUSES).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
                </select>
                <button onClick={deleteSegment} aria-label="Delete segment"
                  className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-400 hover:bg-red-950 border border-red-900 px-3 py-2.5 sm:py-1.5 rounded-lg transition-colors duration-fast">
                  <Trash2 size={13} aria-hidden="true" /> <span className="hidden sm:inline">Delete</span>
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
                <input className="input sm:text-xs" type="date" value={seg[field] ?? ''} onChange={e => updateSeg(field, e.target.value || null)} />
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
      <div className="flex gap-1 border-b border-gray-800 mb-6 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto no-scrollbar" role="tablist">
        {['overview', 'subtasks', 'roles', 'notes'].map(t => (
          <button key={t} onClick={() => openTab(t)} role="tab" aria-selected={activeTab === t}
            className={`flex items-center whitespace-nowrap px-3 md:px-4 py-2.5 text-sm font-medium capitalize transition-colors duration-fast border-b-2 -mb-px focus-visible:outline-none focus-visible:bg-gray-800/60 ${activeTab === t ? 'border-brand-400 text-brand-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
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
                <button onClick={() => openTab('notes')} className="text-xs text-brand-400 hover:underline">View all</button>
              </div>
              <p className="text-sm text-gray-400 line-clamp-3 whitespace-pre-wrap leading-relaxed">{seg.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Subtasks ── */}
      {activeTab === 'subtasks' && (
        <div>
          <div className="flex justify-end mb-2">
            <Link to={subtasksPath}
              className="btn-ghost flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-700">
              <Maximize2 size={13} aria-hidden="true" /> Full screen
            </Link>
          </div>
          <SubtaskBoard work={work} highlightId={searchParams.get('highlight')} highlightGateId={searchParams.get('gate')} />
        </div>
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
                          {isExec && <button onClick={() => work.removeRole(r.id)} className="text-gray-500 hover:text-red-400"><X size={12} /></button>}
                        </div>
                      ))}
                      {assigned.length === 0 && <span className="text-xs text-gray-600 italic">No one assigned</span>}
                    </div>
                    {isExec && (
                      <select className="input sm:text-xs w-auto" value="" onChange={e => { if (e.target.value) work.addRole(role, e.target.value) }}>
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
                          {isExec && <button onClick={() => work.removeRole(r.id)} className="text-gray-500 hover:text-red-400"><X size={11} /></button>}
                        </div>
                      ))}
                    </div>
                    {isExec && (
                      <select className="input sm:text-xs w-auto flex-shrink-0" value="" onChange={e => { if (e.target.value) work.addRole(role, e.target.value) }}>
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
                      {isExec && <button onClick={() => work.removeRole(r.id)} className="text-gray-600 hover:text-red-400 ml-1"><X size={14} /></button>}
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
        onAdded={work.addRoleLocal} />
    </div>
  )
}
