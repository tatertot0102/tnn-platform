// Sends the structured emails composed from chat, using the shared branded
// template so they look like every other platform email.
//
// Setup lives in ../_shared/email.ts (Gmail OAuth secrets).

import { corsHeadersFor, sendTemplated } from '../_shared/email.ts'

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { to, subject, text, sender_name, segment_title, url } = await req.json()

    if (!Array.isArray(to) || to.length === 0) {
      return new Response(JSON.stringify({ error: 'to[] is required' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const heading = subject || 'Message from TNN'
    const result = await sendTemplated(to, heading, {
      kicker: 'Message',
      heading,
      intro: sender_name ? `${sender_name} sent this from the TNN Platform.` : undefined,
      fields: segment_title ? [{ label: 'Segment', value: segment_title }] : undefined,
      quote: text || '',
      cta: url ? { label: 'Open in the platform', url } : undefined,
    })

    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-email error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
