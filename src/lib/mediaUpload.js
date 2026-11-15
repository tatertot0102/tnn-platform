import { supabase } from './supabase'

// Resumable chunked uploads to the media server. Every chunk is retried on its
// own, and after a drop the server is asked how much it really has, so a
// phone losing signal or locking its screen only pauses an upload.

const MAX_RETRIES = 10
const BACKOFF_START_MS = 1000
const BACKOFF_MAX_MS = 30_000
// A chunk that reports no progress for this long is treated as dropped.
const STALL_MS = 45_000

export class UploadFailed extends Error {}

const abortError = () => new DOMException('Upload cancelled', 'AbortError')

async function token() {
  const { data } = await supabase.auth.getSession()
  const value = data.session?.access_token
  if (!value) throw new UploadFailed('You were signed out. Sign in again, then press Retry.')
  return value
}

/**
 * One HTTP request with upload progress. Resolves with { status, data } for
 * any HTTP reply, and rejects with { network: true } when the connection fails.
 */
function send(url, { method, body, contentType, onProgress, signal }) {
  return token().then(bearer => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const xhr = new XMLHttpRequest()
    let stall
    const kick = () => { clearTimeout(stall); stall = setTimeout(() => xhr.abort(), STALL_MS) }
    const done = () => { clearTimeout(stall); signal?.removeEventListener('abort', cancel) }
    const cancel = () => { done(); xhr.abort(); reject(abortError()) }

    xhr.open(method, url)
    xhr.setRequestHeader('Authorization', `Bearer ${bearer}`)
    if (contentType) xhr.setRequestHeader('Content-Type', contentType)
    xhr.upload.onprogress = e => { kick(); onProgress?.(e.loaded) }
    xhr.onload = () => {
      done()
      let data = {}
      try { data = JSON.parse(xhr.responseText || '{}') } catch { /* not JSON */ }
      resolve({ status: xhr.status, data })
    }
    xhr.onerror = () => { done(); reject({ network: true }) }
    xhr.onabort = () => { done(); if (!signal?.aborted) reject({ network: true }) }
    signal?.addEventListener('abort', cancel, { once: true })
    kick()
    xhr.send(body ?? null)
  }))
}

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(abortError()) }, { once: true })
})

// Resolves when the device is back online (or right away if it is).
const online = signal => new Promise((resolve, reject) => {
  if (navigator.onLine !== false) return resolve()
  const back = () => { window.removeEventListener('online', back); resolve() }
  window.addEventListener('online', back)
  signal?.addEventListener('abort', () => { window.removeEventListener('online', back); reject(abortError()) }, { once: true })
})

// Coming back to the tab ends a backoff wait early.
const visible = () => new Promise(resolve => {
  const check = () => {
    if (document.visibilityState !== 'visible') return
    document.removeEventListener('visibilitychange', check)
    resolve()
  }
  document.addEventListener('visibilitychange', check)
})

function fatalMessage(status, data) {
  if (status === 401) return 'You were signed out. Sign in again, then press Retry.'
  if (status === 413) return 'This file is larger than the media server allows.'
  return data.error || `The media server refused this file (${status}).`
}

/**
 * Runs `attempt` until it returns a reply that isn't a dropped connection or a
 * server hiccup, waiting longer each time. Returns the final { status, data }.
 */
async function withRetries(attempt, { signal, onStatus }) {
  for (let tries = 0; ; tries++) {
    let reply
    try {
      reply = await attempt()
      if (reply.status < 500 && reply.status !== 0) return reply
    } catch (err) {
      if (!err?.network) throw err
    }
    if (tries >= MAX_RETRIES) {
      throw new UploadFailed('Lost connection to the media server. Press Retry to carry on from where it stopped.')
    }
    if (navigator.onLine === false) {
      onStatus?.({ state: 'offline' })
      await online(signal)
    } else {
      const wait = Math.min(BACKOFF_MAX_MS, BACKOFF_START_MS * 2 ** tries)
      onStatus?.({ state: 'reconnecting', retryAt: Date.now() + wait })
      await Promise.race([sleep(wait, signal), visible()])
    }
    if (signal?.aborted) throw abortError()
  }
}

/**
 * Uploads a file in chunks, resuming after drops.
 * @param {string} baseUrl media server origin
 * @param {string} folder
 * @param {File} file
 * @param {{
 *   onProgress?: (sent: number) => void,
 *   onStatus?: (status: { state: 'uploading'|'reconnecting'|'offline', retryAt?: number, uploadId?: string }) => void,
 *   signal?: AbortSignal,
 *   uploadId?: string,
 * }} [options] pass `uploadId` from an earlier attempt to resume it
 * @returns {Promise<string>} the saved file name (numbered if the name was taken)
 */
export async function resumableUpload(baseUrl, folder, file, { onProgress, onStatus, signal, uploadId: resumeId } = {}) {
  const retry = attempt => withRetries(attempt, { signal, onStatus })
  const api = path => `${baseUrl}/api/uploads${path}`

  async function begin() {
    const { status, data } = await retry(() => send(api(''), {
      method: 'POST', signal, contentType: 'application/json',
      body: JSON.stringify({ folder, name: file.name, size: file.size }),
    }))
    if (status >= 400) throw new UploadFailed(fatalMessage(status, data))
    return data
  }

  // Asks the server how far an earlier attempt got; null if it's gone.
  async function where(id) {
    const { status, data } = await retry(() => send(api(`/${id}`), { method: 'GET', signal }))
    if (status === 404) return null
    if (status >= 400) throw new UploadFailed(fatalMessage(status, data))
    return data
  }

  let uploadId = resumeId
  let chunkSize
  let offset = 0
  const known = uploadId ? await where(uploadId) : null
  if (known?.done) { onProgress?.(file.size); return known.done }
  if (known && known.size === file.size) {
    chunkSize = known.chunkSize
    offset = known.received
  } else {
    ({ uploadId, chunkSize } = await begin())
  }
  onStatus?.({ state: 'uploading', uploadId })
  onProgress?.(offset)

  while (offset < file.size) {
    let isRetry = false
    const { status, data } = await retry(async () => {
      // After a drop, carry on from whatever the server actually kept.
      if (isRetry) {
        const check = await send(api(`/${uploadId}`), { method: 'GET', signal })
        if (check.status !== 200) return check
        offset = check.data.received
      }
      isRetry = true
      const reply = await send(api(`/${uploadId}?offset=${offset}`), {
        method: 'PUT', signal, contentType: 'application/octet-stream',
        body: file.slice(offset, offset + chunkSize),
        onProgress: loaded => onProgress?.(offset + loaded),
      })
      if (reply.status >= 500) offset = reply.data.received ?? offset
      return reply
    })
    if (status === 409 && Number.isSafeInteger(data.received)) offset = data.received
    else if (status >= 400) throw new UploadFailed(fatalMessage(status, data))
    else offset = data.received
    onStatus?.({ state: 'uploading', uploadId })
    onProgress?.(offset)
  }

  const { status, data } = await retry(() => send(api(`/${uploadId}/complete`), { method: 'POST', signal }))
  if (status >= 400) throw new UploadFailed(fatalMessage(status, data))
  return data.name
}
