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

// Matches http(s) links and bare www. links. Trailing punctuation that
// usually ends a sentence is left out of the link.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<]+[^\s<.,:;"')\]!?]/gi

// Splits plain text into text and link segments. Only http(s) hrefs are
// produced, so a message can never smuggle in a javascript: URL.
export function splitTextWithLinks(text = '') {
  const parts = []
  let cursor = 0
  for (const match of text.matchAll(URL_RE)) {
    if (match.index > cursor) parts.push({ type: 'text', value: text.slice(cursor, match.index) })
    const raw = match[0]
    parts.push({ type: 'link', value: raw, href: /^https?:\/\//i.test(raw) ? raw : `https://${raw}` })
    cursor = match.index + raw.length
  }
  if (cursor < text.length) parts.push({ type: 'text', value: text.slice(cursor) })
  return parts
}

// Sends a branded email through the send-email edge function (Gmail API).
// Returns { ok, error } instead of throwing: callers post the message first
// (the message is the source of truth) and surface a delivery failure
// separately, so a broken mailbox never looks like a successful send.
export async function sendEmail({ to, subject, text, senderName, segmentTitle, url }) {
  const recipients = [...new Set((to ?? []).filter(Boolean))]
  if (recipients.length === 0) return { ok: false, error: 'No recipients have an email address.' }

  try {
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: {
        to: recipients, subject, text,
        sender_name: senderName ?? null,
        segment_title: segmentTitle ?? null,
        url: url ?? null,
      },
    })
    if (error) {
      // FunctionsHttpError keeps the real reason in the response body.
      const detail = await error.context?.json?.().then(b => b?.error).catch(() => null)
      console.error('send-email failed:', detail ?? error)
      return { ok: false, error: detail ?? error.message ?? 'Email service error.' }
    }
    if (data?.error) return { ok: false, error: data.error }
    return { ok: true }
  } catch (err) {
    console.error('send-email failed:', err)
    return { ok: false, error: err?.message ?? 'Could not reach the email service.' }
  }
}
