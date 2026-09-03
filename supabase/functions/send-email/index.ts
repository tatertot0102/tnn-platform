// Sends email via the Gmail API using a regular Google account's OAuth
// refresh token — free, works with a personal/free Gmail account (no
// Google Workspace required, unlike service-account domain-wide delegation).
//
// Required secrets (set with `supabase secrets set`):
//   GOOGLE_OAUTH_CLIENT_ID       from a Google Cloud OAuth client (type: Web application)
//   GOOGLE_OAUTH_CLIENT_SECRET   from the same OAuth client
//   GOOGLE_OAUTH_REFRESH_TOKEN   obtained once via a consent flow for the sending Gmail account
//   GMAIL_SENDER                the Gmail address the refresh token belongs to, e.g. bthstnn@gmail.com
//
// One-time setup (cannot be done from here — see chat for the walkthrough):
//   1. Google Cloud Console: enable the Gmail API, create an OAuth client
//      (type: Web application), add https://developers.google.com/oauthplayground
//      as an authorized redirect URI.
//   2. Use OAuth Playground (with your own client ID/secret) to authorize
//      scope https://www.googleapis.com/auth/gmail.send as the TNN Gmail
//      account, then exchange the code for a refresh token.
//   3. Set the OAuth consent screen's publishing status to "In production"
//      so the refresh token doesn't expire after 7 days.
//   4. Set the four secrets above.

const GOOGLE_OAUTH_CLIENT_ID = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
const GOOGLE_OAUTH_CLIENT_SECRET = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
const GOOGLE_OAUTH_REFRESH_TOKEN = Deno.env.get('GOOGLE_OAUTH_REFRESH_TOKEN')
const GMAIL_SENDER = Deno.env.get('GMAIL_SENDER')

const DEFAULT_ALLOWED_ORIGINS = [
  'http://platform.bthstnn.org',
  'https://platform.bthstnn.org',
  'https://tatertot0102.github.io',
]

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? DEFAULT_ALLOWED_ORIGINS.join(','))
  .split(',')
  .map(o => o.trim().replace(/\/$/, ''))
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

function base64url(bytes: Uint8Array | string) {
  const buf = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
  let binary = ''
  buf.forEach(b => { binary += String.fromCharCode(b) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function getAccessToken(): Promise<string> {
  if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET || !GOOGLE_OAUTH_REFRESH_TOKEN || !GMAIL_SENDER) {
    throw new Error('Gmail sending is not configured (missing OAuth secrets)')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: GOOGLE_OAUTH_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(`Google token error: ${JSON.stringify(data)}`)
  return data.access_token
}

function buildRawMessage({ to, subject, text }: { to: string[]; subject: string; text: string }) {
  const message = [
    `From: TNN Platform <${GMAIL_SENDER}>`,
    `To: ${to.join(', ')}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    text,
  ].join('\r\n')

  return base64url(message)
}

async function sendGmail(to: string[], subject: string, text: string) {
  if (to.length === 0) return { skipped: true }
  const accessToken = await getAccessToken()
  const raw = buildRawMessage({ to, subject, text })

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(`Gmail send error: ${JSON.stringify(data)}`)
  return data
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { to, subject, text } = await req.json()

    if (!Array.isArray(to) || to.length === 0) {
      return new Response(JSON.stringify({ error: 'to[] is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const result = await sendGmail(to, subject || 'TNN Platform notification', text || '')

    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-email error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
