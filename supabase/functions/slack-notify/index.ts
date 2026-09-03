import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!
const SITE_URL = (Deno.env.get('SITE_URL') ?? 'http://platform.bthstnn.org').replace(/\/$/, '')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const DEFAULT_ALLOWED_ORIGINS = [
  'http://platform.bthstnn.org',
  'https://tatertot0102.github.io',
]

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? DEFAULT_ALLOWED_ORIGINS.join(','))
  .split(',')
  .map(origin => origin.trim().replace(/\/$/, ''))
  .filter(Boolean)

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin')?.replace(/\/$/, '')
  const allowedOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0]

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ── Slack helpers ──────────────────────────────────────────────

async function openDM(slackUserId: string): Promise<string | null> {
  const res = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ users: slackUserId }),
  })
  const data = await res.json()
  if (!data.ok) { console.error('conversations.open failed:', data.error); return null }
  return data.channel.id
}

async function sendSlackDM(slackUserId: string, text: string, blocks?: object[]) {
  const channelId = await openDM(slackUserId)
  if (!channelId) return

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel: channelId, text, blocks }),
  })
  const data = await res.json()
  if (!data.ok) console.error('chat.postMessage failed:', data.error)
}

// ── Lookup helpers ─────────────────────────────────────────────

async function getProfile(userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('full_name, slack_user_id')
    .eq('id', userId)
    .single()
  return data
}

async function getSegment(segmentId: string) {
  const { data } = await supabase
    .from('segments')
    .select('id, title, priority, due_date, status')
    .eq('id', segmentId)
    .single()
  return data
}

function getSubtaskAssigneeIds(record: any): string[] {
  if (Array.isArray(record?.assignee_ids)) return record.assignee_ids.filter(Boolean)
  return record?.assignee_id ? [record.assignee_id] : []
}

function getAddedAssigneeIds(oldRecord: any, newRecord: any): string[] {
  const oldIds = new Set(getSubtaskAssigneeIds(oldRecord))
  return getSubtaskAssigneeIds(newRecord).filter(id => !oldIds.has(id))
}

// ── Priority emoji ─────────────────────────────────────────────

function priorityEmoji(priority: string) {
  return { 'ultra-high': '🔴', 'high': '🟠', 'medium': '🟡', 'low': '🟢', 'tbd': '⚪' }[priority] ?? '⚪'
}

function statusEmoji(status: string) {
  return { 'not-started': '⏳', 'in-progress': '🎬', 'blocked': '🚫', 'done': '✅' }[status] ?? '📋'
}

function fmtDate(d: string | null) {
  if (!d) return 'No due date'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function segmentUrl(segmentId: string) {
  return `${SITE_URL}/segments/${segmentId}`
}

// ── Notification builders ──────────────────────────────────────

async function notifySegmentRoleAssigned(record: any) {
  // record = new segment_roles row
  const [profile, segment] = await Promise.all([
    getProfile(record.user_id),
    getSegment(record.segment_id),
  ])
  if (!profile?.slack_user_id || !segment) return

  const text = `You've been assigned as *${record.role_type}* on *${segment.title}*`
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🎬 *New role assignment*\nYou're the *${record.role_type}* on *${segment.title}*`,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Priority*\n${priorityEmoji(segment.priority)} ${segment.priority}` },
        { type: 'mrkdwn', text: `*Due Date*\n${fmtDate(segment.due_date)}` },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Segment' },
          url: segmentUrl(segment.id),
          style: 'primary',
        },
      ],
    },
  ]

  await sendSlackDM(profile.slack_user_id, text, blocks)
}

async function notifySubtaskAssigned(record: any, userIds?: string[]) {
  const assigneeIds = userIds ?? getSubtaskAssigneeIds(record)
  if (!assigneeIds.length) return

  const segment = await getSegment(record.segment_id)
  if (!segment) return

  const text = `New subtask assigned: *${record.title}* on *${segment.title}*`
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `✅ *New subtask assigned to you*\n*${record.title}*\nOn segment: *${segment.title}*`,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Due*\n${fmtDate(record.due_date)}` },
        { type: 'mrkdwn', text: `*Segment priority*\n${priorityEmoji(segment.priority)} ${segment.priority}` },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Segment' },
          url: segmentUrl(segment.id),
        },
      ],
    },
  ]

  const notified = new Set<string>()
  for (const userId of assigneeIds) {
    const profile = await getProfile(userId)
    if (profile?.slack_user_id && !notified.has(profile.slack_user_id)) {
      notified.add(profile.slack_user_id)
      await sendSlackDM(profile.slack_user_id, text, blocks)
    }
  }
}

async function notifySubtaskDueDateChanged(oldRecord: any, newRecord: any) {
  if (oldRecord?.due_date === newRecord?.due_date) return

  const assigneeIds = getSubtaskAssigneeIds(newRecord)
  if (!assigneeIds.length) return

  const segment = await getSegment(newRecord.segment_id)
  if (!segment) return

  const text = `Subtask due date updated: *${newRecord.title}* on *${segment.title}*`
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `📅 *Subtask due date updated*\n*${newRecord.title}*\nOn segment: *${segment.title}*`,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Old Due Date*\n${fmtDate(oldRecord?.due_date)}` },
        { type: 'mrkdwn', text: `*New Due Date*\n${fmtDate(newRecord?.due_date)}` },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Segment' },
          url: segmentUrl(segment.id),
        },
      ],
    },
  ]

  const notified = new Set<string>()
  for (const userId of assigneeIds) {
    const profile = await getProfile(userId)
    if (profile?.slack_user_id && !notified.has(profile.slack_user_id)) {
      notified.add(profile.slack_user_id)
      await sendSlackDM(profile.slack_user_id, text, blocks)
    }
  }
}

async function notifySegmentStatusChanged(oldRecord: any, newRecord: any) {
  if (oldRecord.status === newRecord.status) return

  // Get all people assigned to this segment
  const { data: roles } = await supabase
    .from('segment_roles')
    .select('user_id, profiles(slack_user_id, full_name)')
    .eq('segment_id', newRecord.id)

  if (!roles?.length) return

  const text = `${statusEmoji(newRecord.status)} *${newRecord.title}* status changed to *${newRecord.status}*`
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${statusEmoji(newRecord.status)} *Segment status update*\n*${newRecord.title}* moved from *${oldRecord.status}* → *${newRecord.status}*`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Segment' },
          url: segmentUrl(newRecord.id),
        },
      ],
    },
  ]

  // Notify everyone on the segment
  const notified = new Set<string>()
  for (const role of roles) {
    const slackId = (role.profiles as any)?.slack_user_id
    if (slackId && !notified.has(slackId)) {
      notified.add(slackId)
      await sendSlackDM(slackId, text, blocks)
    }
  }
}

// ── Main handler ───────────────────────────────────────────────

async function sendReminder(record: any) {
  const { slack_user_id, message, segment_title, segment_id } = record
  if (!slack_user_id) return

  const blocks: object[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🔔 *Reminder from TNN*
${message}`,
      },
    },
  ]

  if (segment_title && segment_id) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: `View: ${segment_title}` },
          url: segmentUrl(segment_id),
        },
      ],
    })
  }

  await sendSlackDM(slack_user_id, `🔔 Reminder: ${message}`, blocks)
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const body = await req.json()
    const { type, table, record, old_record } = body

    console.log(`Webhook received: ${type} on ${table}`)

    if (type === 'REMINDER') {
      await sendReminder(record)
    }

    else if (table === 'segment_roles' && type === 'INSERT') {
      await notifySegmentRoleAssigned(record)
    }

    else if (table === 'subtasks' && type === 'INSERT' && getSubtaskAssigneeIds(record).length) {
      await notifySubtaskAssigned(record)
    }

    else if (table === 'subtasks' && type === 'UPDATE') {
      const addedAssigneeIds = getAddedAssigneeIds(old_record, record)
      if (addedAssigneeIds.length) {
        await notifySubtaskAssigned(record, addedAssigneeIds)
      }
      await notifySubtaskDueDateChanged(old_record, record)
    }

    else if (table === 'segments' && type === 'UPDATE') {
      await notifySegmentStatusChanged(old_record, record)
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })
  } catch (err) {
    console.error('slack-notify error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })
  }
})
