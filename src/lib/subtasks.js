import { isBefore, isToday } from 'date-fns'

export function getSubtaskAssigneeIds(task) {
  if (Array.isArray(task.assignee_ids)) return task.assignee_ids.filter(Boolean)
  return task.assignee_id ? [task.assignee_id] : []
}

export function getSubtaskAssigneeNames(task, members) {
  return getSubtaskAssigneeIds(task)
    .map(memberId => members.find(m => m.id === memberId)?.full_name)
    .filter(Boolean)
}

export function isOverdue(dueDate, done) {
  if (!dueDate || done) return false
  const due = new Date(`${dueDate}T00:00:00`)
  return isBefore(due, new Date()) && !isToday(due)
}

export function gateApprovers(gate) {
  return gate?.approval_gate_approvers ?? []
}

// Subtasks and gates interleave in one ordered list per milestone. A gate
// that is not yet approved blocks every item below it in that list.
export function orderItems(subtasks, gates, milestoneId) {
  const inGroup = x => (x.milestone_id ?? null) === (milestoneId ?? null)
  const rows = [
    ...subtasks.filter(inGroup).map(t => ({ ...t, kind: 'subtask' })),
    ...gates.filter(inGroup).map(g => ({ ...g, kind: 'gate' })),
  ].sort((a, b) =>
    (a.position ?? 0) - (b.position ?? 0) ||
    new Date(a.created_at) - new Date(b.created_at)
  )

  let blocker = null
  return rows.map(row => {
    const next = { ...row, blockedBy: blocker }
    if (row.kind === 'gate' && row.status !== 'approved') blocker = blocker ?? row
    return next
  })
}

// Mirrors recompute_gate_status() in supabase/add_multi_approvers.sql so the
// row updates the instant someone decides, before the database echoes back.
export function deriveGateStatus(approvers = []) {
  if (approvers.some(a => a.status === 'changes_requested')) return 'changes_requested'
  if (approvers.length > 0 && approvers.every(a => a.status === 'approved')) return 'approved'
  return 'pending'
}
