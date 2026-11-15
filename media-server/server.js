import { createServer } from 'node:http'
import { createApp } from './app.js'
import { createSupabaseClient } from './lib/supabase.js'
import { createUploadStore } from './lib/uploads.js'
import { createPreviewer } from './lib/previews.js'
import { homedir } from 'node:os'
import path from 'node:path'

const SWEEP_INTERVAL_MS = 60 * 60 * 1000

// Timestamp every log line so failures can be matched up with restarts.
for (const level of ['log', 'error']) {
  const write = console[level].bind(console)
  console[level] = (...args) => write(new Date().toISOString(), ...args)
}

function required(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`[media] Missing required setting ${name}. See media-server/README.md.`)
    process.exit(1)
  }
  return value
}

const config = {
  root: required('MEDIA_ROOT'),
  secret: required('MEDIA_SIGNING_SECRET'),
  publicUrl: required('MEDIA_PUBLIC_URL').replace(/\/+$/, ''),
  allowedOrigins: required('MEDIA_ALLOWED_ORIGINS').split(',').map(s => s.trim()).filter(Boolean),
  host: process.env.MEDIA_HOST ?? '127.0.0.1',
  port: Number(process.env.MEDIA_PORT ?? 8090),
}
if (config.secret.length < 32) {
  console.error('[media] MEDIA_SIGNING_SECRET must be at least 32 characters.')
  process.exit(1)
}

const supabase = createSupabaseClient({ url: required('SUPABASE_URL'), anonKey: required('SUPABASE_ANON_KEY') })
const uploads = createUploadStore(config.root)
// Previews live outside the shared folder so nothing there changes.
const previews = createPreviewer({
  cacheDir: process.env.MEDIA_CACHE_DIR ?? path.join(homedir(), 'Library', 'Caches', 'tnn-media', 'previews'),
  onError: (err, rel) => console.error(`[media] preview failed for ${rel}:`, err.message),
})
const server = createServer(createApp({ ...config, supabase, uploads, previews }))

// Large uploads and slow phones need longer than Node's defaults.
server.requestTimeout = 15 * 60 * 1000
server.headersTimeout = 60 * 1000

setInterval(() => uploads.sweep().catch(err => console.error('[media] sweep failed:', err)), SWEEP_INTERVAL_MS).unref()

server.listen(config.port, config.host, () => {
  console.log(`[media] Serving ${config.root} on http://${config.host}:${config.port} as ${config.publicUrl}`)
})
