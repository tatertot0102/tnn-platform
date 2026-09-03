import { supabase } from './supabase'

// Splits a message body into plain-text and mention segments so the UI can
// render mentions as clickable chips. `mentions` is the jsonb array captured
// at send time: [{ type, id, label, segment_id? }, ...].
export function splitBodyWithMentions(body, mentions = []) {
  if (!mentions?.length) return [{ type: 'text', value: body }]

  const tokens = mentions.map(m => ({ ...m, needle: `@${m.label}` }))
  const parts = []
  let cursor = 0

  while (cursor < body.length) {
    let best = null
    for (const t of tokens) {
      const idx = body.indexOf(t.needle, cursor)
      if (idx !== -1 && (!best || idx < best.idx)) best = { idx, t }
    }
    if (!best) { parts.push({ type: 'text', value: body.slice(cursor) }); break }
    if (best.idx > cursor) parts.push({ type: 'text', value: body.slice(cursor, best.idx) })
    parts.push({ type: 'mention', mention: best.t })
    cursor = best.idx + best.t.needle.length
  }

  return parts
}

// Fire-and-forget email via the send-email edge function (Gmail API).
// Failures are logged but never block the chat flow — email is a
// notification side-effect, not the source of truth (the message is).
export async function sendEmail({ to, subject, text }) {
  const recipients = [...new Set((to ?? []).filter(Boolean))]
  if (recipients.length === 0) return
  try {
    const { error } = await supabase.functions.invoke('send-email', {
      body: { to: recipients, subject, text },
    })
    if (error) console.error('send-email failed:', error)
  } catch (err) {
    console.error('send-email failed:', err)
  }
}
