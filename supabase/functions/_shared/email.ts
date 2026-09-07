// Shared branded email template + Gmail sender for every TNN Platform email.
//
// Every message the platform sends (role assignments, due dates, approval
// gates, manual reminders, chat emails) is rendered through renderEmail() so
// they all look like they come from the same product.
//
// Required secrets (set with `supabase secrets set`):
//   GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
//   GOOGLE_OAUTH_REFRESH_TOKEN, GMAIL_SENDER

const GOOGLE_OAUTH_CLIENT_ID = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
const GOOGLE_OAUTH_CLIENT_SECRET = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
const GOOGLE_OAUTH_REFRESH_TOKEN = Deno.env.get('GOOGLE_OAUTH_REFRESH_TOKEN')
const GMAIL_SENDER = Deno.env.get('GMAIL_SENDER')

export const SITE_URL = (Deno.env.get('SITE_URL') ?? 'http://platform.bthstnn.org').replace(/\/$/, '')

// The site redirects http to https; some mail clients will not follow that
// for images, so the logo is always requested over https.
const LOGO_URL = `${SITE_URL.replace(/^http:/, 'https:')}/tnn-logo.png`

// Brand palette, matching tailwind.config.js
const BRAND = '#3a5fd9'
const INK = '#111827'
const MUTED = '#6b7280'
const LINE = '#e4e7ec'
const PAGE = '#f4f5f7'

export type Accent = 'brand' | 'green' | 'red' | 'amber'

const ACCENTS: Record<Accent, { bar: string; chipBg: string; chipText: string }> = {
  brand: { bar: BRAND,     chipBg: '#eef2ff', chipText: '#1e3a8a' },
  green: { bar: '#16a34a', chipBg: '#ecfdf3', chipText: '#15803d' },
  red:   { bar: '#dc2626', chipBg: '#fef2f2', chipText: '#b91c1c' },
  amber: { bar: '#d97706', chipBg: '#fffbeb', chipText: '#b45309' },
}

export interface EmailFields { label: string; value: string }

export interface EmailOptions {
  /** Small uppercase label in the header, e.g. "Role assigned". */
  kicker: string
  /** The headline of the message. */
  heading: string
  /** One or two sentences under the heading. */
  intro?: string
  /** Label/value rows rendered as a bordered widget, like the app's cards. */
  fields?: EmailFields[]
  /** Free text quoted in its own block, e.g. a comment or reminder body. */
  quote?: string
  /** Primary call to action. */
  cta?: { label: string; url: string }
  accent?: Accent
}

function escapeHtml(value: string) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function nl2br(value: string) {
  return escapeHtml(value).replace(/\r?\n/g, '<br />')
}

/** The plain-text alternative, for clients that will not render HTML. */
export function renderText(o: EmailOptions) {
  return [
    o.kicker.toUpperCase(),
    '',
    o.heading,
    o.intro ?? '',
    '',
    ...(o.fields ?? []).map(f => `${f.label}: ${f.value}`),
    o.quote ? `\n"${o.quote}"` : '',
    o.cta ? `\n${o.cta.label}: ${o.cta.url}` : '',
    '',
    '---',
    `TNN Platform · ${SITE_URL}`,
  ].filter(line => line !== undefined).join('\n')
}

/** The branded HTML email. Table-based and inline-styled for email clients. */
export function renderEmail(o: EmailOptions) {
  const accent = ACCENTS[o.accent ?? 'brand']

  const fields = (o.fields ?? []).length === 0 ? '' : `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:0 0 24px;border:1px solid ${LINE};border-radius:10px;background:#fbfbfd;">
      ${(o.fields ?? []).map((f, i) => `
      <tr>
        <td style="padding:12px 16px;${i > 0 ? `border-top:1px solid ${LINE};` : ''}font:600 11px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};white-space:nowrap;">${escapeHtml(f.label)}</td>
        <td style="padding:12px 16px;${i > 0 ? `border-top:1px solid ${LINE};` : ''}font:500 14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:${INK};text-align:right;">${escapeHtml(f.value)}</td>
      </tr>`).join('')}
    </table>`

  const quote = !o.quote ? '' : `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="padding:14px 16px;background:${accent.chipBg};border-left:3px solid ${accent.bar};border-radius:6px;font:400 14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:${INK};">${nl2br(o.quote)}</td>
      </tr>
    </table>`

  const cta = !o.cta ? '' : `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
      <tr>
        <td style="border-radius:8px;background:${BRAND};">
          <a href="${escapeHtml(o.cta.url)}" style="display:inline-block;padding:12px 22px;font:600 14px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(o.cta.label)}</a>
        </td>
      </tr>
    </table>`

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(o.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE};">
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${escapeHtml(o.intro ?? o.heading)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
          style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:14px;overflow:hidden;">

          <tr><td style="height:4px;background:${accent.bar};font-size:0;line-height:0;">&nbsp;</td></tr>

          <tr>
            <td style="padding:22px 32px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;width:44px;">
                    <img src="${LOGO_URL}" width="36" height="36" alt="TNN"
                      style="display:block;width:36px;height:36px;border:0;" />
                  </td>
                  <td style="vertical-align:middle;font:700 15px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:${INK};letter-spacing:-.01em;">
                    TNN Platform
                  </td>
                  <td style="vertical-align:middle;text-align:right;">
                    <span style="display:inline-block;padding:5px 10px;border-radius:999px;background:${accent.chipBg};color:${accent.chipText};font:600 10px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;">${escapeHtml(o.kicker)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 32px 0;">
              <h1 style="margin:0 0 10px;font:700 22px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:${INK};letter-spacing:-.02em;">${escapeHtml(o.heading)}</h1>
              ${o.intro ? `<p style="margin:0 0 22px;font:400 15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:${MUTED};">${nl2br(o.intro)}</p>` : '<div style="height:12px;"></div>'}
            </td>
          </tr>

          <tr><td style="padding:0 32px;">${fields}${quote}${cta}</td></tr>

          <tr>
            <td style="padding:24px 32px 26px;">
              <div style="border-top:1px solid ${LINE};padding-top:16px;font:400 12px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:${MUTED};">
                Sent by the TNN Platform, the home for segments, deadlines, and team chat.<br />
                <a href="${SITE_URL}" style="color:${BRAND};text-decoration:none;">${SITE_URL.replace(/^https?:\/\//, '')}</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ── Gmail sending ──────────────────────────────────────────────

function base64url(input: Uint8Array | string) {
  const buf = typeof input === 'string' ? new TextEncoder().encode(input) : input
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

/** Encodes non-ASCII subjects so Gmail does not mangle them. */
function encodeSubject(subject: string) {
  // deno-lint-ignore no-control-regex
  return /^[\x00-\x7F]*$/.test(subject)
    ? subject
    : `=?utf-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(subject)))}?=`
}

/** Sends a multipart/alternative message: plain text plus the branded HTML. */
export async function sendMail(
  to: string[], subject: string, text: string, html: string,
) {
  const recipients = [...new Set(to.filter(Boolean))]
  if (recipients.length === 0) return { skipped: true }

  const accessToken = await getAccessToken()
  const boundary = `tnn_${crypto.randomUUID()}`

  const raw = base64url([
    `From: TNN Platform <${GMAIL_SENDER}>`,
    `To: ${recipients.join(', ')}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
    '',
    `--${boundary}--`,
  ].join('\r\n'))

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(`Gmail send error: ${JSON.stringify(data)}`)
  return data
}

/** Renders the template and sends it in one step. */
export function sendTemplated(to: string[], subject: string, options: EmailOptions) {
  return sendMail(to, subject, renderText(options), renderEmail(options))
}

export const CORS_DEFAULT_ORIGINS = [
  'http://platform.bthstnn.org',
  'https://platform.bthstnn.org',
  'https://tatertot0102.github.io',
]

export function corsHeadersFor(req: Request) {
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? CORS_DEFAULT_ORIGINS.join(','))
    .split(',').map(o => o.trim().replace(/\/$/, '')).filter(Boolean)
  const origin = req.headers.get('Origin')?.replace(/\/$/, '')
  return {
    'Access-Control-Allow-Origin': origin && allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}
