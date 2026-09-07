// Replaces the old slack-notify function. Every notification that used to be
// a Slack DM is now a branded email built from _shared/email.ts.
//
// Wire these Database Webhooks (Supabase → Database → Webhooks) to this
// function, all of them HTTP POST:
//   segment_roles     INSERT
//   subtasks          INSERT, UPDATE
//   segments          UPDATE
//   approval_gates    INSERT, UPDATE
//   approval_feedback INSERT
//
// The Send Reminder modal posts { type: 'REMINDER' } to it directly.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeadersFor, sendTemplated, SITE_URL, type Accent } from '../_shared/email.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// ── Lookups ────────────────────────────────────────────────────

async function emailsFor(userIds: string[]): Promise<string[]> {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (ids.length === 0) return []
  const { data } = await supabase.from('profiles').select('email').in('id', ids)
  return (data ?? []).map(p => p.email).filter(Boolean)
}

async function nameFor(userId: string | null): Promise<string> {
  if (!userId) return 'Someone'
  const { data } = await supabase.from('profiles').select('full_name').eq('id', userId).single()
  return data?.full_name ?? 'Someone'
}

async function getSegment(segmentId: string) {
  const { data } = await supabase
    .from('segments').select('id, title, priority, due_date, status').eq('id', segmentId).single()
  return data
}

async function segmentTeamIds(segmentId: string): Promise<string[]> {
  const { data } = await supabase.from('segment_roles').select('user_id').eq('segment_id', segmentId)
  return (data ?? []).map(r => r.user_id).filter(Boolean)
}

function assigneeIds(record: any): string[] {
  if (Array.isArray(record?.assignee_ids)) return record.assignee_ids.filter(Boolean)
  return record?.assignee_id ? [record.assignee_id] : []
}

function addedAssignees(oldRecord: any, newRecord: any): string[] {
  const before = new Set(assigneeIds(oldRecord))
  return assigneeIds(newRecord).filter(id => !before.has(id))
}

// ── Formatting ─────────────────────────────────────────────────

const PRIORITY_LABELS: Record<string, string> = {
  'ultra-high': 'Ultra-High', high: 'High', medium: 'Medium', low: 'Low', tbd: 'TBD',
}

const STATUS_LABELS: Record<string, string> = {
  'not-started': 'Not started', 'in-progress': 'In progress', blocked: 'Blocked', done: 'Done',
}

function fmtDate(d: string | null) {
  if (!d) return 'No due date'
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

const segmentUrl = (id: string) => `${SITE_URL}/segments/${id}`
const gateUrl = (segmentId: string, gateId: string) =>
  `${SITE_URL}/segments/${segmentId}?tab=subtasks&gate=${gateId}`

// ── Notifications ──────────────────────────────────────────────

async function roleAssigned(record: any) {
  const [to, segment] = await Promise.all([emailsFor([record.user_id]), getSegment(record.segment_id)])
  if (!to.length || !segment) return

  await sendTemplated(to, `You're the ${record.role_type} on ${segment.title}`, {
    kicker: 'Role assigned',
    heading: `You're the ${record.role_type} on ${segment.title}`,
    intro: 'You have been added to this segment. Open the platform to see the subtasks and deadlines that are now yours.',
    fields: [
      { label: 'Role', value: record.role_type },
      { label: 'Segment', value: segment.title },
      { label: 'Priority', value: PRIORITY_LABELS[segment.priority] ?? segment.priority },
      { label: 'Segment due', value: fmtDate(segment.due_date) },
    ],
    cta: { label: 'View segment', url: segmentUrl(segment.id) },
  })
}

async function subtaskAssigned(record: any, userIds?: string[]) {
  const ids = userIds ?? assigneeIds(record)
  const [to, segment] = await Promise.all([emailsFor(ids), getSegment(record.segment_id)])
  if (!to.length || !segment) return

  const due = record.due_date ? new Date(`${record.due_date}T00:00:00`) : null
  const overdue = due && due < new Date(new Date().toDateString())

  await sendTemplated(to, `New task: ${record.title}`, {
    kicker: 'Task assigned',
    heading: record.title,
    intro: `You have been assigned this task on ${segment.title}.`,
    accent: overdue ? 'red' : 'brand',
    fields: [
      { label: 'Segment', value: segment.title },
      { label: 'Due', value: fmtDate(record.due_date) },
      { label: 'Priority', value: PRIORITY_LABELS[segment.priority] ?? segment.priority },
    ],
    cta: { label: 'Open task', url: `${segmentUrl(segment.id)}?tab=subtasks&highlight=${record.id}` },
  })
}

async function subtaskDueDateChanged(oldRecord: any, record: any) {
  if (oldRecord?.due_date === record?.due_date) return
  const [to, segment] = await Promise.all([emailsFor(assigneeIds(record)), getSegment(record.segment_id)])
  if (!to.length || !segment) return

  await sendTemplated(to, `Due date changed: ${record.title}`, {
    kicker: 'Deadline changed',
    heading: `New due date for ${record.title}`,
    intro: `The deadline for this task on ${segment.title} moved.`,
    accent: 'amber',
    fields: [
      { label: 'Segment', value: segment.title },
      { label: 'Was due', value: fmtDate(oldRecord?.due_date ?? null) },
      { label: 'Now due', value: fmtDate(record.due_date) },
    ],
    cta: { label: 'Open task', url: `${segmentUrl(segment.id)}?tab=subtasks&highlight=${record.id}` },
  })
}

async function segmentStatusChanged(oldRecord: any, record: any) {
  if (oldRecord?.status === record?.status) return
  const to = await emailsFor(await segmentTeamIds(record.id))
  if (!to.length) return

  await sendTemplated(to, `${record.title} is now ${STATUS_LABELS[record.status] ?? record.status}`, {
    kicker: 'Status update',
    heading: `${record.title} moved to ${STATUS_LABELS[record.status] ?? record.status}`,
    intro: 'The status of a segment you are working on changed.',
    accent: record.status === 'done' ? 'green' : record.status === 'blocked' ? 'red' : 'brand',
    fields: [
      { label: 'Was', value: STATUS_LABELS[oldRecord?.status] ?? oldRecord?.status ?? '—' },
      { label: 'Now', value: STATUS_LABELS[record.status] ?? record.status },
      { label: 'Segment due', value: fmtDate(record.due_date) },
    ],
    cta: { label: 'View segment', url: segmentUrl(record.id) },
  })
}

async function approvalRequested(record: any) {
  if (!record.approver_id) return
  const [to, segment] = await Promise.all([emailsFor([record.approver_id]), getSegment(record.segment_id)])
  if (!to.length || !segment) return

  await sendTemplated(to, `Your approval is needed: ${record.title}`, {
    kicker: 'Approval needed',
    heading: record.title,
    intro: `You are the approver on this gate. Everything below it on ${segment.title} stays blocked until you approve it.`,
    accent: 'amber',
    fields: [
      { label: 'Segment', value: segment.title },
      { label: 'Due', value: fmtDate(record.due_date) },
    ],
    quote: record.description || undefined,
    cta: { label: 'Review and approve', url: gateUrl(segment.id, record.id) },
  })
}

async function approvalDecided(oldRecord: any, record: any) {
  if (oldRecord?.status === record?.status || record.status === 'pending') return
  const approved = record.status === 'approved'

  const recipients = [...new Set([record.created_by, ...(await segmentTeamIds(record.segment_id))])]
    .filter(id => id && id !== record.decided_by) as string[]
  const [to, segment, decider] = await Promise.all([
    emailsFor(recipients), getSegment(record.segment_id), nameFor(record.decided_by),
  ])
  if (!to.length || !segment) return

  await sendTemplated(to, `${approved ? 'Approved' : 'Changes requested'}: ${record.title}`, {
    kicker: approved ? 'Approved' : 'Changes requested',
    heading: `${decider} ${approved ? 'approved' : 'requested changes on'} ${record.title}`,
    intro: approved
      ? `Work below this gate on ${segment.title} is unblocked.`
      : `Work below this gate on ${segment.title} stays blocked until it is approved.`,
    accent: approved ? 'green' : 'red',
    fields: [
      { label: 'Segment', value: segment.title },
      { label: 'Decided by', value: decider },
    ],
    cta: { label: 'View gate', url: gateUrl(segment.id, record.id) },
  })
}

async function approvalFeedback(record: any) {
  const { data: gate } = await supabase
    .from('approval_gates').select('*').eq('id', record.gate_id).single()
  if (!gate) return

  const recipients = [gate.approver_id, gate.created_by].filter(id => id && id !== record.author_id) as string[]
  const [to, segment, author] = await Promise.all([
    emailsFor(recipients), getSegment(gate.segment_id), nameFor(record.author_id),
  ])
  if (!to.length || !segment) return

  const accent: Accent = record.kind === 'approved' ? 'green'
    : record.kind === 'changes_requested' ? 'red' : 'brand'

  await sendTemplated(to, `${author} commented on ${gate.title}`, {
    kicker: 'Feedback',
    heading: `${author} left feedback on ${gate.title}`,
    intro: `On ${segment.title}.`,
    accent,
    quote: record.body,
    cta: { label: 'Open gate', url: gateUrl(segment.id, gate.id) },
  })
}

async function reminder(record: any) {
  const to: string[] = record.emails ?? (record.user_id ? await emailsFor([record.user_id]) : [])
  if (!to.length) return

  await sendTemplated(to, record.segment_title ? `Reminder: ${record.segment_title}` : 'Reminder from TNN', {
    kicker: 'Reminder',
    heading: record.segment_title ? `Reminder about ${record.segment_title}` : 'Reminder from TNN',
    intro: record.sender_name ? `${record.sender_name} sent this from the platform.` : undefined,
    quote: record.message,
    cta: record.segment_id
      ? { label: `View ${record.segment_title ?? 'segment'}`, url: segmentUrl(record.segment_id) }
      : { label: 'Open the platform', url: SITE_URL },
  })
}

// ── Handler ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { type, table, record, old_record } = await req.json()
    console.log(`notify: ${type} on ${table}`)

    if (type === 'REMINDER') await reminder(record)

    else if (table === 'segment_roles' && type === 'INSERT') await roleAssigned(record)

    else if (table === 'subtasks' && type === 'INSERT' && assigneeIds(record).length) {
      await subtaskAssigned(record)
    }

    else if (table === 'subtasks' && type === 'UPDATE') {
      const added = addedAssignees(old_record, record)
      if (added.length) await subtaskAssigned(record, added)
      await subtaskDueDateChanged(old_record, record)
    }

    else if (table === 'segments' && type === 'UPDATE') await segmentStatusChanged(old_record, record)

    else if (table === 'approval_gates' && type === 'INSERT') await approvalRequested(record)

    else if (table === 'approval_gates' && type === 'UPDATE') {
      if (record.approver_id !== old_record?.approver_id) await approvalRequested(record)
      await approvalDecided(old_record, record)
    }

    else if (table === 'approval_feedback' && type === 'INSERT') await approvalFeedback(record)

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('notify error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
