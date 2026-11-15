// TNN browser gate: only the TNN account in ALLOWED_EMAIL can reach the
// browser container.
//
// Two ways in, both checked against Supabase (the platform's own login):
//   1. The platform's "Browser" button calls POST /session with the user's
//      Supabase token and gets a one-time link (/enter?ticket=...).
//   2. A plain email + password form at /login (fallback).
// Either way the gate then issues its own session cookie, so a session isn't
// tied to the one-hour Supabase token. The Supabase token never reaches the
// container, which only ever sees the gate's own container password.

import http from 'node:http'
import net from 'node:net'
import { randomBytes } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'

const LISTEN_HOST = '127.0.0.1'
const LISTEN_PORT = Number(process.env.GATE_PORT ?? 8091)
const UPSTREAM_HOST = '127.0.0.1'
const UPSTREAM_PORT = Number(process.env.UPSTREAM_PORT ?? 3100)
const COOKIE = 'tnn_browser_session'
const SESSION_MS = 8 * 60 * 60 * 1000
const TICKET_MS = 60 * 1000
const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_MAX_LOGIN = 8
const RATE_MAX_SESSION = 30
const MAX_ENTRIES = 1000

function readEnvFile(path) {
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => line.includes('=') && !line.trimStart().startsWith('#'))
      .map((line) => {
        const i = line.indexOf('=')
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()]
      }),
  )
}

const env = readEnvFile(process.env.GATE_ENV_FILE)
const SUPABASE_URL = env.SUPABASE_URL.replace(/\/+$/, '')
const ANON_KEY = env.SUPABASE_ANON_KEY
const ALLOWED_EMAIL = env.ALLOWED_EMAIL.toLowerCase()
const PUBLIC_URL = (env.PUBLIC_URL || `http://${LISTEN_HOST}:${LISTEN_PORT}`).replace(/\/+$/, '')
const ALLOWED_ORIGINS = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const CONTAINER_PASSWORD = readFileSync(process.env.CONTAINER_PW_FILE, 'utf8').trim()
const CONTAINER_AUTH = 'Basic ' + Buffer.from(`browser:${CONTAINER_PASSWORD}`).toString('base64')

const DOCKER_DIRS = ['/usr/local/bin', '/opt/homebrew/bin', '/Applications/Docker.app/Contents/Resources/bin']
const EXEC_PATH = [...DOCKER_DIRS, process.env.PATH ?? '/usr/bin:/bin'].join(':')
const DOCKER = env.DOCKER_BIN || DOCKER_DIRS.map((d) => `${d}/docker`).find(existsSync) || 'docker'
const CONTAINERS_SCRIPT = env.CONTAINERS_SCRIPT || `${homedir()}/.tnn-browser/start-containers.sh`
const BROWSER = 'tnn-browser'
const VOLUME = 'tnn-browser-config'

// ── In-memory state (a restart signs everyone out, which is fine) ──

const sessions = new Map() // id -> expires
const tickets = new Map() // ticket -> expires
const attempts = new Map() // key -> { count, resetAt }

function remember(map, key, expires) {
  if (map.size >= MAX_ENTRIES) map.delete(map.keys().next().value)
  map.set(key, expires)
}

const newToken = () => randomBytes(32).toString('base64url')

function startSession() {
  const id = newToken()
  remember(sessions, id, Date.now() + SESSION_MS)
  return id
}

const streams = new Map() // session id -> open WebSocket sockets

function sessionId(req) {
  const match = (req.headers.cookie ?? '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))
  return match ? match[1] : null
}

// Ends a session and cuts off any stream it still has open.
function endSession(id) {
  sessions.delete(id)
  for (const socket of streams.get(id) ?? []) socket.destroy()
  streams.delete(id)
}

function hasSession(req) {
  const id = sessionId(req)
  const expires = id ? sessions.get(id) : undefined
  if (!expires) return false
  if (expires < Date.now()) {
    endSession(id)
    return false
  }
  return true
}

function takeTicket(ticket) {
  const expires = tickets.get(ticket)
  tickets.delete(ticket)
  return Boolean(expires) && expires >= Date.now()
}

// True once a client has used up its attempts for this window.
function rateLimited(key, max) {
  const now = Date.now()
  const entry = attempts.get(key)
  if (!entry || entry.resetAt < now) {
    remember(attempts, key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }
  entry.count += 1
  return entry.count > max
}

const clientIp = (req) => req.headers['cf-connecting-ip'] ?? req.socket.remoteAddress ?? 'unknown'
const isHttps = (req) => req.headers['x-forwarded-proto'] === 'https'

// ── Supabase ──

// Asks Supabase who owns a platform token. Returns the lowercased email or null.
async function emailForToken(token) {
  if (!token) return null
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    })
    return res.ok ? ((await res.json())?.email?.toLowerCase() ?? null) : null
  } catch {
    return null
  }
}

async function passwordLogin(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json().catch(() => null)
  return res.ok && body?.access_token ? body : null
}

// ── Responses ──

const LOGIN_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Browser sign-in</title>
<style>
  body{font-family:system-ui,sans-serif;background:#f6f5f2;color:#1d1d1b;display:grid;place-items:center;min-height:100vh;margin:0}
  form{background:#fff;padding:28px;border-radius:12px;width:min(340px,90vw);box-shadow:0 8px 30px rgba(0,0,0,.08)}
  h1{font-size:18px;margin:0 0 16px}
  label{display:block;font-size:13px;margin:12px 0 4px}
  input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:8px;font-size:15px}
  button{margin-top:18px;width:100%;padding:11px;border:0;border-radius:8px;background:#1d1d1b;color:#fff;font-size:15px;cursor:pointer}
  .err{color:#b00020;font-size:13px;margin-top:12px}
</style></head>
<body><form method="post" action="/login">
  <h1>Browser sign-in</h1>
  <label for="email">TNN email</label>
  <input id="email" name="email" type="email" autocomplete="username" required>
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required>
  <button type="submit">Sign in</button>
  __ERROR__
</form></body></html>`

function sendHtml(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

function corsHeaders(req) {
  const origin = req.headers.origin
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {}
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'Origin',
  }
}

function sendJson(req, res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...corsHeaders(req) })
  res.end(JSON.stringify(body))
}

function redirectWithSession(req, res, location) {
  const secure = isHttps(req) ? '; Secure' : ''
  res.writeHead(303, {
    location,
    'cache-control': 'no-store',
    'set-cookie': `${COOKIE}=${startSession()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}${secure}`,
  })
  res.end()
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 10_000) reject(new Error('body too large'))
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

// ── Routes ──

async function handleLogin(req, res) {
  if (req.method === 'GET') return sendHtml(res, 200, LOGIN_PAGE.replace('__ERROR__', ''))
  const failed = (status, message) =>
    sendHtml(res, status, LOGIN_PAGE.replace('__ERROR__', `<div class="err">${message}</div>`))

  if (rateLimited(`login:${clientIp(req)}`, RATE_MAX_LOGIN)) return failed(429, 'Too many attempts. Try again later.')
  const form = new URLSearchParams(await readBody(req))
  const email = (form.get('email') ?? '').trim().toLowerCase()

  let login
  try {
    login = await passwordLogin(email, form.get('password') ?? '')
  } catch {
    return failed(502, 'Could not reach TNN sign-in. Try again.')
  }
  if (!login) return failed(401, 'Email or password is incorrect.')
  if (email !== ALLOWED_EMAIL) return failed(403, 'This browser is only available to one TNN account.')
  return redirectWithSession(req, res, '/')
}

// Called by the platform with the signed-in user's Supabase token.
async function handleSession(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req))
    return res.end()
  }
  if (req.method !== 'POST') return sendJson(req, res, 405, { error: 'POST only' })
  if (!corsHeaders(req)['access-control-allow-origin']) return sendJson(req, res, 403, { error: 'Origin not allowed' })
  if (rateLimited(`session:${clientIp(req)}`, RATE_MAX_SESSION)) return sendJson(req, res, 429, { error: 'Too many attempts' })

  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  const email = await emailForToken(token)
  if (!email) return sendJson(req, res, 401, { error: 'Sign in to the platform again.' })
  if (email !== ALLOWED_EMAIL) return sendJson(req, res, 403, { error: 'The remote browser isn’t available to this account.' })

  const ticket = newToken()
  remember(tickets, ticket, Date.now() + TICKET_MS)
  return sendJson(req, res, 200, { url: `${PUBLIC_URL}/enter?ticket=${ticket}` })
}

function handleEnter(req, res, url) {
  if (takeTicket(url.searchParams.get('ticket') ?? '')) return redirectWithSession(req, res, '/')
  res.writeHead(303, { location: '/login' })
  res.end()
}

// Visit /logout to sign out: ends the session, closes the stream, clears the cookie.
function handleLogout(req, res) {
  const id = sessionId(req)
  if (id) endSession(id)
  const secure = isHttps(req) ? '; Secure' : ''
  res.writeHead(303, {
    location: '/login',
    'cache-control': 'no-store',
    'set-cookie': `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`,
  })
  res.end()
}

// ── Browser controls (restart / stop / start / reset) ──

function run(cmd, args, timeout = 120_000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, env: { ...process.env, PATH: EXEC_PATH } }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim().slice(0, 300)))
      else resolve(stdout.trim())
    })
  })
}

async function isRunning() {
  try {
    return (await run(DOCKER, ['inspect', '-f', '{{.State.Running}}', BROWSER], 15_000)) === 'true'
  } catch {
    return false
  }
}

const ACTIONS = {
  status: async () => ({ running: await isRunning() }),
  // Ends every gate session and closes every open stream.
  signout: async () => {
    for (const id of [...sessions.keys()]) endSession(id)
    return { running: await isRunning() }
  },
  restart: async () => {
    await run(DOCKER, ['restart', BROWSER])
    return { running: true }
  },
  stop: async () => {
    await run(DOCKER, ['stop', BROWSER])
    return { running: false }
  },
  start: async () => {
    await run(DOCKER, ['start', BROWSER])
    return { running: true }
  },
  // Wipes the browser's profile and installed apps, then rebuilds it fresh.
  reset: async () => {
    await run(DOCKER, ['rm', '-f', BROWSER], 30_000)
    await run(DOCKER, ['volume', 'rm', VOLUME], 30_000).catch(() => {})
    await run('/bin/bash', [CONTAINERS_SCRIPT], 300_000)
    return { running: true }
  },
}

let busy = false

async function performAction(action) {
  const fn = Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : null
  if (!fn) return { status: 400, body: { error: 'Unknown action' } }
  if (action === 'status' || action === 'signout') return { status: 200, body: await fn() }
  if (busy) return { status: 409, body: { error: 'Another action is still running.' } }
  busy = true
  try {
    return { status: 200, body: await fn() }
  } catch (err) {
    return { status: 500, body: { error: `That didn’t work: ${err.message}` } }
  } finally {
    busy = false
  }
}

// Called by the platform's menu with the signed-in user's Supabase token.
async function handleControl(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req))
    return res.end()
  }
  if (req.method !== 'POST') return sendJson(req, res, 405, { error: 'POST only' })
  if (!corsHeaders(req)['access-control-allow-origin']) return sendJson(req, res, 403, { error: 'Origin not allowed' })
  if (rateLimited(`control:${clientIp(req)}`, RATE_MAX_SESSION)) return sendJson(req, res, 429, { error: 'Too many attempts' })

  const email = await emailForToken((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''))
  if (!email) return sendJson(req, res, 401, { error: 'Sign in to the platform again.' })
  if (email !== ALLOWED_EMAIL) return sendJson(req, res, 403, { error: 'The remote browser isn’t available to this account.' })

  let action
  try {
    action = JSON.parse(await readBody(req))?.action
  } catch {
    return sendJson(req, res, 400, { error: 'Bad request' })
  }
  const result = await performAction(action)
  return sendJson(req, res, result.status, result.body)
}

// Called by the small menu inside the browser page, using the gate's own session.
async function handlePillControl(req, res) {
  if (req.method !== 'POST' || !hasSession(req) || req.headers.origin !== PUBLIC_URL) {
    return sendJson(req, res, 403, { error: 'Not allowed' })
  }
  let action
  try {
    action = JSON.parse(await readBody(req))?.action
  } catch {
    return sendJson(req, res, 400, { error: 'Bad request' })
  }
  if (action !== 'restart') return sendJson(req, res, 400, { error: 'Unknown action' })
  const result = await performAction(action)
  return sendJson(req, res, result.status, result.body)
}

// A small menu added to the browser page so you can restart or sign out from inside it.
const PILL = `<script>(()=>{
const box=document.createElement('div');box.style.cssText='position:fixed;right:10px;bottom:10px;z-index:2147483647;font:13px system-ui,sans-serif;text-align:right';
const menu=document.createElement('div');menu.style.cssText='display:none;margin-bottom:6px;background:#1d1d1b;color:#fff;border-radius:10px;padding:6px;box-shadow:0 6px 24px rgba(0,0,0,.4)';
const note=document.createElement('div');note.style.cssText='padding:6px 10px;display:none';menu.appendChild(note);
function item(label,fn){const b=document.createElement('button');b.textContent=label;b.style.cssText='display:block;width:100%;text-align:left;background:none;border:0;color:inherit;font:inherit;padding:8px 12px;cursor:pointer;border-radius:6px';b.onmouseenter=()=>b.style.background='#333';b.onmouseleave=()=>b.style.background='none';b.onclick=fn;menu.appendChild(b)}
item('Restart browser',async()=>{if(!confirm('Restart the browser? Open tabs are lost.'))return;note.style.display='block';note.textContent='Restarting…';try{await fetch('/__tnn/control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'restart'})})}catch{}const t=Date.now();const wait=async()=>{let up=false;try{up=(await fetch('/',{cache:'no-store'})).ok}catch{}if(up||Date.now()-t>90000)setTimeout(()=>location.reload(),12000);else setTimeout(wait,2000)};setTimeout(wait,3000)});
item('Sign out',()=>{location.href='/logout'});
const toggle=document.createElement('button');toggle.textContent='⋯';toggle.title='Browser menu';toggle.style.cssText='width:34px;height:34px;border-radius:17px;border:0;background:#1d1d1b;color:#fff;opacity:.55;cursor:pointer;font-size:16px';
toggle.onmouseenter=()=>toggle.style.opacity='1';toggle.onmouseleave=()=>toggle.style.opacity='.55';
toggle.onclick=()=>{menu.style.display=menu.style.display==='none'?'block':'none'};
box.append(menu,toggle);document.body.appendChild(box)})()</script>`

function forwardHeaders(headers, plainText = false) {
  const out = { ...headers, host: `${UPSTREAM_HOST}:${UPSTREAM_PORT}`, authorization: CONTAINER_AUTH }
  delete out.cookie
  if (plainText) out['accept-encoding'] = 'identity'
  return out
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://gate')
  try {
    if (url.pathname === '/login') return await handleLogin(req, res)
    if (url.pathname === '/session') return await handleSession(req, res)
    if (url.pathname === '/enter') return handleEnter(req, res, url)
    if (url.pathname === '/logout') return handleLogout(req, res)
    if (url.pathname === '/control') return await handleControl(req, res)
    if (url.pathname === '/__tnn/control') return await handlePillControl(req, res)
    if (!hasSession(req)) {
      res.writeHead(302, { location: '/login' })
      return res.end()
    }
    const isPage = req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')
    const upstream = http.request(
      { host: UPSTREAM_HOST, port: UPSTREAM_PORT, method: req.method, path: req.url, headers: forwardHeaders(req.headers, isPage) },
      (up) => {
        if (!isPage || !String(up.headers['content-type']).includes('text/html')) {
          res.writeHead(up.statusCode, up.headers)
          return up.pipe(res)
        }
        const chunks = []
        up.on('data', (chunk) => chunks.push(chunk))
        up.on('end', () => {
          const html = Buffer.concat(chunks).toString('utf8')
          const body = Buffer.from(html.includes('</body>') ? html.replace('</body>', () => `${PILL}</body>`) : html + PILL)
          const headers = { ...up.headers, 'content-length': body.length }
          res.writeHead(up.statusCode, headers)
          res.end(body)
        })
      },
    )
    upstream.on('error', () => {
      if (!res.headersSent) sendHtml(res, 502, 'The browser is not running.')
      else res.destroy()
    })
    req.pipe(upstream)
  } catch {
    if (!res.headersSent) sendHtml(res, 500, 'Something went wrong.')
  }
})

// WebSocket upgrades (the remote desktop stream) get the same check.
server.on('upgrade', (req, socket, head) => {
  if (!hasSession(req)) return socket.destroy()
  const id = sessionId(req)
  const open = streams.get(id) ?? new Set()
  open.add(socket)
  streams.set(id, open)
  socket.on('close', () => open.delete(socket))
  const upstream = net.connect(UPSTREAM_PORT, UPSTREAM_HOST, () => {
    let raw = `${req.method} ${req.url} HTTP/1.1\r\n`
    for (const [key, value] of Object.entries(forwardHeaders(req.headers))) {
      for (const v of [].concat(value)) raw += `${key}: ${v}\r\n`
    }
    upstream.write(`${raw}\r\n`)
    if (head?.length) upstream.write(head)
    socket.pipe(upstream).pipe(socket)
  })
  upstream.on('error', () => socket.destroy())
  socket.on('error', () => upstream.destroy())
})

// Drop expired sessions, tickets and rate-limit windows.
setInterval(() => {
  const now = Date.now()
  for (const [key, expires] of sessions) if (expires < now) endSession(key)
  for (const [key, expires] of tickets) if (expires < now) tickets.delete(key)
  for (const [key, entry] of attempts) if (entry.resetAt < now) attempts.delete(key)
}, 60_000).unref()

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`TNN browser gate on http://${LISTEN_HOST}:${LISTEN_PORT} (public ${PUBLIC_URL})`)
})
