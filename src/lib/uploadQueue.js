import { ensureFolder, uploadFile } from './media'
import { queryClient } from './queryClient'

// One upload queue for the whole app, so moving between pages never stops an
// upload. Any number of files can be added; a few transfer at a time (more at
// once would make every file crawl and time out on phones), and each one
// retries and resumes on its own.
//
// Item: { id, name, size, folder, sent, status, error?, savedAs?, retryAt?, speed, addedAt }
// status: 'queued' | 'uploading' | 'reconnecting' | 'offline' | 'done' | 'error' | 'cancelled'

const isPhone = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
export const UPLOAD_CONCURRENCY = isPhone ? 3 : 4
const PROGRESS_EMIT_MS = 250
const REFRESH_DEBOUNCE_MS = 1500
const SPEED_SMOOTHING = 0.3
// How long a just-uploaded file stays highlighted in its folder.
const FRESH_MS = 8000

export const ACTIVE_STATES = new Set(['queued', 'uploading', 'reconnecting', 'offline'])

let items = []
const files = new Map()        // id -> File
const controllers = new Map()  // id -> AbortController
const uploadIds = new Map()    // id -> server upload id, so Retry resumes
const speedSamples = new Map() // id -> { at, sent }
const listeners = new Set()
let emitTimer = null
let refreshTimer = null

function emit() {
  clearTimeout(emitTimer)
  emitTimer = null
  listeners.forEach(fn => fn())
}

// Progress ticks are frequent; batch them so a 1,000-file list stays smooth.
function emitSoon() {
  if (!emitTimer) emitTimer = setTimeout(emit, PROGRESS_EMIT_MS)
}

function patch(id, changes, { now = true } = {}) {
  items = items.map(item => (item.id === id ? { ...item, ...changes } : item))
  if (now) emit()
  else emitSoon()
}

// Re-lists open folders shortly after files land (once per burst).
function refreshFolders() {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => queryClient.invalidateQueries({ queryKey: ['media', 'browse'] }), REFRESH_DEBOUNCE_MS)
}

function trackSpeed(id, sent) {
  const now = performance.now()
  const last = speedSamples.get(id)
  speedSamples.set(id, { at: now, sent })
  if (!last || now - last.at < 200 || sent < last.sent) return undefined
  const instant = ((sent - last.sent) / (now - last.at)) * 1000
  const prev = items.find(i => i.id === id)?.speed ?? instant
  return prev + SPEED_SMOOTHING * (instant - prev)
}

async function run(item) {
  const controller = new AbortController()
  controllers.set(item.id, controller)
  patch(item.id, { status: 'uploading', error: undefined, retryAt: undefined })
  try {
    const savedAs = await uploadFile(item.folder, files.get(item.id), {
      signal: controller.signal,
      uploadId: uploadIds.get(item.id),
      onProgress: sent => {
        const speed = trackSpeed(item.id, sent)
        patch(item.id, speed === undefined ? { sent } : { sent, speed }, { now: false })
      },
      onStatus: ({ state, retryAt, uploadId }) => {
        if (uploadId) uploadIds.set(item.id, uploadId)
        patch(item.id, { status: state, retryAt })
      },
    })
    patch(item.id, { status: 'done', sent: item.size, savedAs, retryAt: undefined, fresh: true })
    setTimeout(() => patch(item.id, { fresh: false }), FRESH_MS)
    files.delete(item.id)
    uploadIds.delete(item.id)
    refreshFolders()
  } catch (err) {
    if (err?.name === 'AbortError') patch(item.id, { status: 'cancelled', retryAt: undefined })
    else patch(item.id, { status: 'error', error: err?.message || 'Upload failed', retryAt: undefined })
  } finally {
    controllers.delete(item.id)
    speedSamples.delete(item.id)
    pump()
  }
}

function pump() {
  const busy = controllers.size
  const waiting = items.filter(i => i.status === 'queued' && !controllers.has(i.id))
  waiting.slice(0, Math.max(0, UPLOAD_CONCURRENCY - busy)).forEach(run)
}

/**
 * Adds files to the queue. Empty files are skipped.
 * @param {Iterable<File>} fileList
 * @param {string} folder
 * @returns {{ added: number, skipped: number }}
 */
export function addFiles(fileList, folder) {
  const all = Array.from(fileList ?? [])
  if (!folder || !all.length) return { added: 0, skipped: 0 }
  const usable = all.filter(f => f.size > 0)
  const addedAt = Date.now()
  const entries = usable.map(file => {
    const id = crypto.randomUUID()
    files.set(id, file)
    return { id, name: file.name, size: file.size, type: file.type, folder, sent: 0, status: 'queued', speed: 0, addedAt }
  })
  items = [...items, ...entries]
  emit()
  pump()
  return { added: entries.length, skipped: all.length - usable.length }
}

/**
 * Adds files picked or dropped as a folder tree, recreating their subfolders.
 * @param {{ file: File, dir: string }[]} entries dir is relative to `folder`
 * @param {string} folder
 */
export async function addTree(entries, folder) {
  const byDir = entries.reduce((map, e) => ({ ...map, [e.dir]: [...(map[e.dir] ?? []), e.file] }), {})
  const dirs = Object.keys(byDir).sort()
  const made = { '': folder }
  let added = 0
  let skipped = 0
  for (const dir of dirs) {
    const parts = dir ? dir.split('/') : []
    for (let i = 1; i <= parts.length; i++) {
      const rel = parts.slice(0, i).join('/')
      if (!made[rel]) made[rel] = await ensureFolder(made[parts.slice(0, i - 1).join('/')], parts[i - 1])
    }
    const result = addFiles(byDir[dir], made[dir])
    added += result.added
    skipped += result.skipped
  }
  return { added, skipped }
}

export function cancel(id) {
  const item = items.find(i => i.id === id)
  if (!item || !ACTIVE_STATES.has(item.status)) return
  if (controllers.has(id)) controllers.get(id).abort()
  else patch(id, { status: 'cancelled' })
}

export function cancelAll() {
  items.filter(i => i.status === 'queued' && !controllers.has(i.id)).forEach(i => patch(i.id, { status: 'cancelled' }, { now: false }))
  controllers.forEach(c => c.abort())
  emit()
}

export function retry(id) {
  const item = items.find(i => i.id === id)
  if (!item || !files.has(id) || !['error', 'cancelled'].includes(item.status)) return
  patch(id, { status: 'queued', error: undefined })
  pump()
}

export function retryFailed() {
  items.filter(i => i.status === 'error' && files.has(i.id)).forEach(i => patch(i.id, { status: 'queued', error: undefined }, { now: false }))
  emit()
  pump()
}

export function clearFinished() {
  const gone = items.filter(i => !ACTIVE_STATES.has(i.status))
  gone.forEach(i => { files.delete(i.id); uploadIds.delete(i.id) })
  items = items.filter(i => ACTIVE_STATES.has(i.status))
  emit()
}

// When the tab comes back, uploads waiting out a backoff carry on at once
// (handled inside the uploader); make sure idle slots are filled too.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pump() })
}

export const getFile = id => files.get(id)
export const getSnapshot = () => items
export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
