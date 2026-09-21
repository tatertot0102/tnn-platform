import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useMembers } from './useMembers'
import { getSubtaskAssigneeIds, orderItems, deriveGateStatus, gateApprovers } from '../lib/subtasks'

export const segmentKeys = {
  row:        id => ['segment', id, 'row'],
  subtasks:   id => ['segment', id, 'subtasks'],
  milestones: id => ['segment', id, 'milestones'],
  gates:      id => ['segment', id, 'gates'],
  roles:      id => ['segment', id, 'roles'],
}

// Realtime echoes of our own writes arrive in bursts (a reorder is one update
// per row), so refetches wait for writes to finish and are debounced.
const REFETCH_DEBOUNCE_MS = 300

async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

const byCreated = (a, b) => new Date(a.created_at) - new Date(b.created_at)

const fetchers = {
  row: async id => {
    const { data, error } = await supabase.from('segments').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data
  },
  subtasks: id => rows(supabase.from('subtasks').select('*').eq('segment_id', id)
    .order('position').order('created_at')),
  milestones: id => rows(supabase.from('milestones').select('*').eq('segment_id', id)
    .order('position').order('created_at')),
  // Approvers and feedback ride along with the gates: one round trip, not three.
  gates: async id => {
    const data = await rows(supabase.from('approval_gates')
      .select('*, approval_gate_approvers(user_id, status, decided_at), approval_feedback(*)')
      .eq('segment_id', id).order('position').order('created_at'))
    return data.map(g => ({ ...g, approval_feedback: [...(g.approval_feedback ?? [])].sort(byCreated) }))
  },
  roles: id => rows(supabase.from('segment_roles').select('*, profiles(full_name, id)').eq('segment_id', id)),
}

function useSegmentQuery(name, segmentId) {
  return useQuery({
    queryKey: segmentKeys[name](segmentId),
    queryFn: () => fetchers[name](segmentId),
    enabled: !!segmentId,
  })
}

/** Keeps the segment's cached data in step with other people's edits. */
function useSegmentRealtime(segmentId, pendingWrites, dirtyKeys) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!segmentId) return
    const timers = new Map()

    const refetch = name => {
      const key = segmentKeys[name](segmentId)
      if (pendingWrites.current > 0) { dirtyKeys.current.add(name); return }
      clearTimeout(timers.get(name))
      timers.set(name, setTimeout(() => qc.invalidateQueries({ queryKey: key }), REFETCH_DEBOUNCE_MS))
    }

    const cachedIds = name => new Set((qc.getQueryData(segmentKeys[name](segmentId)) ?? []).map(x => x.id))

    // Filtered subscriptions do not receive DELETEs, so deletes are matched
    // against what is in the cache instead.
    const channel = supabase.channel(`segment-work-${segmentId}`)
    for (const [table, name] of [['subtasks', 'subtasks'], ['milestones', 'milestones'], ['approval_gates', 'gates']]) {
      channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `segment_id=eq.${segmentId}` }, () => refetch(name))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: `segment_id=eq.${segmentId}` }, () => refetch(name))
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, p => {
          if (cachedIds(name).has(p.old?.id)) refetch(name)
        })
    }
    for (const table of ['approval_gate_approvers', 'approval_feedback']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, p => {
        const gateId = p.new?.gate_id ?? p.old?.gate_id
        if (!gateId || cachedIds('gates').has(gateId)) refetch('gates')
      })
    }
    channel
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'segments', filter: `id=eq.${segmentId}` }, () => refetch('row'))
      .subscribe()

    return () => {
      timers.forEach(clearTimeout)
      supabase.removeChannel(channel)
    }
  }, [segmentId, qc, pendingWrites, dirtyKeys])
}

/**
 * Everything the segment page and the full-screen subtasks page need: the
 * segment, its subtasks, milestones, approval gates (with approvers and
 * feedback) and roles, plus every edit. Edits update the screen immediately
 * and roll back with a toast if the database refuses them.
 */
export function useSegmentWork(segmentId) {
  const qc = useQueryClient()
  const toast = useToast()
  const { isExec, profile } = useAuth()
  const profileId = profile?.id

  const pendingWrites = useRef(0)
  const dirtyKeys = useRef(new Set())
  useSegmentRealtime(segmentId, pendingWrites, dirtyKeys)

  const rowQ        = useSegmentQuery('row', segmentId)
  const subtasksQ   = useSegmentQuery('subtasks', segmentId)
  const milestonesQ = useSegmentQuery('milestones', segmentId)
  const gatesQ      = useSegmentQuery('gates', segmentId)
  const rolesQ      = useSegmentQuery('roles', segmentId)
  const membersQ    = useMembers()

  const segment    = rowQ.data ?? null
  const subtasks   = useMemo(() => subtasksQ.data ?? [], [subtasksQ.data])
  const milestones = useMemo(() => milestonesQ.data ?? [], [milestonesQ.data])
  const gates      = useMemo(() => gatesQ.data ?? [], [gatesQ.data])
  const roles      = useMemo(() => rolesQ.data ?? [], [rolesQ.data])
  const members    = useMemo(() => membersQ.data ?? [], [membersQ.data])

  const all = [rowQ, subtasksQ, milestonesQ, gatesQ, rolesQ, membersQ]
  const isLoading = all.some(q => q.isPending)
  const isError = all.some(q => q.isError && q.data === undefined)
  const refetch = useCallback(() => qc.invalidateQueries({ queryKey: ['segment', segmentId] }), [qc, segmentId])

  const segmentMembers = useMemo(() => {
    const ids = new Set(roles.map(r => r.user_id))
    return members.filter(m => ids.has(m.id))
  }, [roles, members])

  const canEdit = isExec || roles.some(r => r.user_id === profileId)

  const key = useCallback(name => segmentKeys[name](segmentId), [segmentId])
  const setLocal = useCallback((name, updater) => qc.setQueryData(key(name), updater), [qc, key])

  const flushDirty = useCallback(() => {
    if (pendingWrites.current > 0) return
    dirtyKeys.current.forEach(name => qc.invalidateQueries({ queryKey: key(name) }))
    dirtyKeys.current.clear()
  }, [qc, key])

  /** Runs `request` after applying `updaters` locally; undoes them if it fails. */
  const optimistic = useCallback(async (updaters, request, errorMessage) => {
    const names = Object.keys(updaters)
    await Promise.all(names.map(n => qc.cancelQueries({ queryKey: key(n) })))
    const snapshots = Object.fromEntries(names.map(n => [n, qc.getQueryData(key(n))]))
    names.forEach(n => qc.setQueryData(key(n), old => updaters[n](old)))

    pendingWrites.current += 1
    try {
      const results = await request()
      const failed = [results].flat().find(r => r?.error)
      if (failed) throw failed.error
      return true
    } catch (err) {
      console.error(err)
      names.forEach(n => qc.setQueryData(key(n), snapshots[n]))
      toast.error(errorMessage)
      return false
    } finally {
      pendingWrites.current -= 1
      flushDirty()
    }
  }, [qc, key, toast, flushDirty])

  const patchById = (id, patch) => list => (list ?? []).map(x => x.id === id ? { ...x, ...patch } : x)
  const withoutId = id => list => (list ?? []).filter(x => x.id !== id)

  const orderedItems = useCallback(milestoneId => orderItems(subtasks, gates, milestoneId), [subtasks, gates])

  // ── Segment ──
  const patchSegmentLocal = fields => setLocal('row', s => ({ ...s, ...fields }))
  const updateSegment = fields => canEdit && optimistic(
    { row: s => ({ ...s, ...fields }) },
    () => supabase.from('segments').update(fields).eq('id', segmentId),
    'Could not save changes.',
  )

  // ── Subtasks ──
  function addSubtask(title, milestoneId = null) {
    if (!canEdit) return
    const row = {
      id: crypto.randomUUID(), segment_id: segmentId, title, completed: false,
      milestone_id: milestoneId, assignee_ids: [], position: orderedItems(milestoneId).length,
    }
    return optimistic(
      { subtasks: list => [...(list ?? []), { ...row, created_at: new Date().toISOString() }] },
      () => supabase.from('subtasks').insert(row),
      'Could not add the subtask.',
    )
  }

  function toggleSubtask(subtaskId) {
    if (!canEdit) return
    const task = subtasks.find(t => t.id === subtaskId)
    if (!task) return
    const completed = !task.completed
    return optimistic(
      { subtasks: patchById(subtaskId, { completed }) },
      () => supabase.from('subtasks').update({ completed }).eq('id', subtaskId),
      'Could not update the subtask.',
    )
  }

  function assignSubtask(subtaskId, userId) {
    if (!canEdit) return
    const task = subtasks.find(t => t.id === subtaskId)
    if (!task) return
    const current = getSubtaskAssigneeIds(task)
    const assignee_ids = current.includes(userId) ? current.filter(x => x !== userId) : [...current, userId]
    return optimistic(
      { subtasks: patchById(subtaskId, { assignee_ids, assignee_id: assignee_ids[0] ?? null }) },
      () => supabase.from('subtasks').update({ assignee_ids }).eq('id', subtaskId),
      'Could not change who is assigned.',
    )
  }

  const updateSubtask = (subtaskId, fields, errorMessage) => canEdit && optimistic(
    { subtasks: patchById(subtaskId, fields) },
    () => supabase.from('subtasks').update(fields).eq('id', subtaskId),
    errorMessage,
  )
  const setSubtaskDate  = (subtaskId, due_date) => updateSubtask(subtaskId, { due_date }, 'Could not change the due date.')
  const renameSubtask   = (subtaskId, title) => updateSubtask(subtaskId, { title }, 'Could not rename the subtask.')
  const setSubmitUrl    = (subtaskId, submit_url) => optimistic(
    { subtasks: patchById(subtaskId, { submit_url }) },
    () => supabase.from('subtasks').update({ submit_url }).eq('id', subtaskId),
    'Could not save the link.',
  )
  const deleteSubtask = subtaskId => isExec && optimistic(
    { subtasks: withoutId(subtaskId) },
    () => supabase.from('subtasks').delete().eq('id', subtaskId),
    'Could not delete the subtask.',
  )

  // ── Ordering (drag and drop) ──
  function moveItemLocal(kind, itemId, milestoneId) {
    setLocal(kind === 'gate' ? 'gates' : 'subtasks', patchById(itemId, { milestone_id: milestoneId }))
  }

  function persistOrder(list, milestoneId) {
    const positions = new Map(list.map((item, idx) => [item.id, idx]))
    const apply = l => (l ?? []).map(x => positions.has(x.id)
      ? { ...x, position: positions.get(x.id), milestone_id: milestoneId } : x)
    return optimistic(
      { subtasks: apply, gates: apply },
      () => Promise.all(list.map((item, idx) =>
        supabase.from(item.kind === 'gate' ? 'approval_gates' : 'subtasks')
          .update({ position: idx, milestone_id: milestoneId }).eq('id', item.id))),
      'Could not save the new order.',
    )
  }

  // ── Milestones ──
  function addMilestone(title) {
    if (!isExec || !title.trim()) return
    const row = { id: crypto.randomUUID(), segment_id: segmentId, title: title.trim(), position: milestones.length }
    return optimistic(
      { milestones: list => [...(list ?? []), { ...row, created_at: new Date().toISOString() }] },
      () => supabase.from('milestones').insert(row),
      'Could not add the milestone.',
    )
  }

  const renameMilestone = (milestoneId, title) => isExec && optimistic(
    { milestones: patchById(milestoneId, { title }) },
    () => supabase.from('milestones').update({ title }).eq('id', milestoneId),
    'Could not rename the milestone.',
  )

  function deleteMilestone(milestoneId) {
    if (!isExec) return
    const ungroup = list => (list ?? []).map(x => x.milestone_id === milestoneId ? { ...x, milestone_id: null } : x)
    return optimistic(
      { milestones: withoutId(milestoneId), subtasks: ungroup, gates: ungroup },
      () => supabase.from('milestones').delete().eq('id', milestoneId),
      'Could not delete the milestone.',
    )
  }

  // ── Approval gates ──
  function saveGate(values, approverIds, editing) {
    if (!canEdit) return
    const approverRows = ids => ids.map(user_id => ({ user_id, status: 'pending', decided_at: null }))

    if (!editing) {
      const gate = {
        ...values, id: crypto.randomUUID(), segment_id: segmentId, created_by: profileId,
        position: orderedItems(values.milestone_id ?? null).length, status: 'pending',
      }
      return optimistic(
        { gates: list => [...(list ?? []), {
          ...gate, created_at: new Date().toISOString(),
          approval_gate_approvers: approverRows(approverIds), approval_feedback: [],
        }] },
        async () => {
          const created = await supabase.from('approval_gates').insert(gate)
          if (created.error) return created
          return supabase.from('approval_gate_approvers')
            .insert(approverIds.map(user_id => ({ gate_id: gate.id, user_id })))
        },
        'Could not create the approval gate.',
      )
    }

    const before = gateApprovers(editing)
    const beforeIds = before.map(a => a.user_id)
    const removed = beforeIds.filter(x => !approverIds.includes(x))
    const added = approverIds.filter(x => !beforeIds.includes(x))
    const nextApprovers = [...before.filter(a => approverIds.includes(a.user_id)), ...approverRows(added)]

    return optimistic(
      { gates: patchById(editing.id, {
        ...values, approval_gate_approvers: nextApprovers, status: deriveGateStatus(nextApprovers),
      }) },
      () => Promise.all([
        supabase.from('approval_gates').update(values).eq('id', editing.id),
        removed.length && supabase.from('approval_gate_approvers').delete()
          .eq('gate_id', editing.id).in('user_id', removed),
        added.length && supabase.from('approval_gate_approvers')
          .insert(added.map(user_id => ({ gate_id: editing.id, user_id }))),
      ]),
      'Could not save the approval gate.',
    )
  }

  const deleteGate = gateId => isExec && optimistic(
    { gates: withoutId(gateId) },
    () => supabase.from('approval_gates').delete().eq('id', gateId),
    'Could not delete the approval gate.',
  )

  // kind: 'comment' | 'approved' | 'changes_requested'. A decision updates only
  // the viewer's own approver row; the database derives the gate status.
  // Feedback rows are mirrored into the segment's chat channel by a trigger.
  async function submitGateFeedback(gate, kind, body) {
    const text = body || (kind === 'approved' ? 'Approved.' : 'Changes requested.')
    const feedback = { id: crypto.randomUUID(), gate_id: gate.id, author_id: profileId, body: text, kind }
    const deciding = kind !== 'comment'
    const decided_at = new Date().toISOString()

    const nextApprovers = gateApprovers(gate).map(a =>
      deciding && a.user_id === profileId ? { ...a, status: kind, decided_at } : a)

    const ok = await optimistic(
      { gates: patchById(gate.id, {
        approval_gate_approvers: nextApprovers,
        status: deriveGateStatus(nextApprovers),
        approval_feedback: [...(gate.approval_feedback ?? []), { ...feedback, created_at: decided_at }],
      }) },
      async () => {
        if (deciding) {
          const decided = await supabase.from('approval_gate_approvers')
            .update({ status: kind, decided_at }).eq('gate_id', gate.id).eq('user_id', profileId)
          if (decided.error) return decided
        }
        return supabase.from('approval_feedback').insert(feedback)
      },
      deciding ? 'Could not record your decision.' : 'Could not post your feedback.',
    )
    if (ok) toast.success('Posted to the segment channel.')
    return ok
  }

  // ── Roles ──
  function addRole(roleType, userId) {
    if (!isExec || !userId) return
    const member = members.find(m => m.id === userId)
    const row = { id: crypto.randomUUID(), segment_id: segmentId, user_id: userId, role_type: roleType, is_guest: false }
    return optimistic(
      { roles: list => [...(list ?? []), { ...row, profiles: { id: userId, full_name: member?.full_name } }] },
      () => supabase.from('segment_roles').insert(row),
      'Could not add that person.',
    )
  }

  const removeRole = roleId => isExec && optimistic(
    { roles: withoutId(roleId) },
    () => supabase.from('segment_roles').delete().eq('id', roleId),
    'Could not remove that person.',
  )

  const addRoleLocal = role => setLocal('roles', list => [...(list ?? []), role])

  return {
    segment, subtasks, milestones, gates, roles, members, segmentMembers,
    isLoading, isError, refetch, canEdit, isExec, profileId, orderedItems,
    patchSegmentLocal, updateSegment,
    addSubtask, toggleSubtask, assignSubtask, setSubtaskDate, renameSubtask, setSubmitUrl, deleteSubtask,
    moveItemLocal, persistOrder,
    addMilestone, renameMilestone, deleteMilestone,
    saveGate, deleteGate, submitGateFeedback,
    addRole, removeRole, addRoleLocal,
  }
}
