// Sends email via the Gmail API using a Google service account with
// domain-wide delegation — free, since it rides on the Google Workspace
// account rather than a third-party transactional email provider.
//
// Required secrets (set with `supabase secrets set`):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL     the service account's client_email
//   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY  the service account's private_key (PEM, \n escaped is fine)
//   GMAIL_SENDER                     the Workspace address to send as, e.g. notifications@bthstnn.org
//
// Setup (one-time, in Google Cloud + Workspace admin — cannot be done from here):
//   1. Create a Google Cloud project, enable the Gmail API.
//   2. Create a service account, generate a JSON key.
//   3. In Workspace Admin > Security > API controls > Domain-wide delegation,
//      add the service account's Client ID with scope:
//      https://www.googleapis.com/auth/gmail.send
//   4. Set the three secrets above from the JSON key + the sending address.

const GOOGLE_SERVICE_ACCOUNT_EMAIL = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
const GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
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

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const normalized = pem.replace(/\\n/g, '\n')
  const b64 = normalized
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

async function getAccessToken(): Promise<string> {
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || !GMAIL_SENDER) {
    throw new Error('Gmail sending is not configured (missing service account secrets)')
  }

  const header = { alg: 'RS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const claim = {
    iss: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: 'https://www.googleapis.com/auth/gmail.send',
    aud: 'https://oauth2.googleapis.com/token',
    sub: GMAIL_SENDER,
    iat: now,
    exp: now + 3600,
  }

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  )

  const jwt = `${signingInput}.${base64url(new Uint8Array(signature))}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
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

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(GMAIL_SENDER!)}/messages/send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    }
  )

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
