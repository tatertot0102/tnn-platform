import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { link, mkdir, readFile, readdir, stat, truncate, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { numberedName } from './paths.js'

// Files arrive in chunks because Cloudflare caps a single request at 100 MB.
// Chunks are appended to a hidden .part file on the same disk, which is then
// hard-linked into place: link() fails instead of overwriting, so an upload can
// never replace a file that is already in the folder.
//
// Uploads are resumable: a chunk that is cut off (phone loses signal, screen
// locks, tunnel drops) is trimmed back to the last whole chunk and the client
// carries on from there. Each upload's details are saved next to its .part
// file, so uploads also survive a server restart.

export const CHUNK_SIZE = 8 * 1024 * 1024
export const MAX_FILE_SIZE = 50 * 1024 * 1024 * 1024
const STALE_AFTER_MS = 24 * 60 * 60 * 1000
// A chunk that sends nothing for this long is treated as a dropped connection.
const CHUNK_IDLE_MS = 30 * 1000
const MAX_NAME_ATTEMPTS = 500
const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export class UploadError extends Error {
  constructor(status, message, extra = {}) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

export function createUploadStore(root) {
  const partsDir = path.join(root, '.tnn-uploads')
  const uploads = new Map()

  const metaPath = id => path.join(partsDir, `${id}.json`)
  const partPath = id => path.join(partsDir, `${id}.part`)
  const saveMeta = upload => {
    const { id, folderPath, name, size, owner, done = null } = upload
    return writeFile(metaPath(id), JSON.stringify({ id, folderPath, name, size, owner, done }))
  }

  async function start({ folderPath, name, size, owner }) {
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_FILE_SIZE) {
      throw new UploadError(400, 'File size is missing or too large')
    }
    await mkdir(partsDir, { recursive: true })
    const id = randomUUID()
    const upload = { id, folderPath, name, size, owner, partPath: partPath(id), received: 0, done: null, active: null, touched: Date.now() }
    await writeFile(upload.partPath, '', { flag: 'wx' })
    await saveMeta(upload)
    uploads.set(id, upload)
    return { uploadId: id, chunkSize: CHUNK_SIZE }
  }

  // Reloads an upload the server forgot (after a restart) from its saved details.
  async function load(id) {
    const meta = JSON.parse(await readFile(metaPath(id), 'utf8'))
    const info = meta.done ? null : await stat(partPath(id))
    const upload = { ...meta, partPath: partPath(id), received: meta.done ? meta.size : info.size, active: null, touched: Date.now() }
    uploads.set(id, upload)
    return upload
  }

  async function get(id, owner) {
    if (typeof id !== 'string' || !UPLOAD_ID.test(id)) throw new UploadError(404, 'Upload not found')
    const upload = uploads.get(id) ?? await load(id).catch(() => null)
    if (!upload || upload.owner !== owner) throw new UploadError(404, 'Upload not found')
    return upload
  }

  async function status(id, owner) {
    const upload = await get(id, owner)
    // Let a chunk that is still being cut off settle before reporting.
    if (upload.active) await upload.active.settled
    return { received: upload.received, size: upload.size, chunkSize: CHUNK_SIZE, done: upload.done }
  }

  async function discard(upload) {
    uploads.delete(upload.id)
    await unlink(upload.partPath).catch(() => {})
    await unlink(metaPath(upload.id)).catch(() => {})
  }

  // Streams one chunk, cutting it off if it goes quiet for too long.
  async function writeChunk(upload, body) {
    let written = 0
    const limit = Math.min(CHUNK_SIZE, upload.size - upload.received)
    let idle
    const kick = () => {
      clearTimeout(idle)
      idle = setTimeout(() => body.destroy(new Error('Chunk stalled')), CHUNK_IDLE_MS)
    }
    async function* capped(source) {
      kick()
      for await (const chunk of source) {
        kick()
        written += chunk.length
        if (written > limit) throw new UploadError(413, 'Chunk is larger than allowed')
        yield chunk
      }
    }
    try {
      await pipeline(body, capped, createWriteStream(upload.partPath, { flags: 'a' }))
      return written
    } finally {
      clearTimeout(idle)
    }
  }

  async function appendChunk(id, owner, offset, body) {
    const upload = await get(id, owner)
    if (upload.done) throw new UploadError(409, 'Upload is already finished', { received: upload.received })
    // A retry means the earlier request for this upload is dead: drop it.
    if (upload.active) {
      upload.active.body.destroy(new Error('Replaced by a retry'))
      await upload.active.settled
    }
    if (offset !== upload.received) {
      throw new UploadError(409, `Expected offset ${upload.received}`, { received: upload.received })
    }

    let settle
    upload.active = { body, settled: new Promise(resolve => { settle = resolve }) }
    try {
      upload.received += await writeChunk(upload, body)
      upload.touched = Date.now()
      return { received: upload.received }
    } catch (err) {
      if (err instanceof UploadError && err.status === 413) {
        await discard(upload)
        throw err
      }
      // Throw away the partial chunk so the file ends on a whole chunk again.
      await truncate(upload.partPath, upload.received).catch(() => {})
      upload.touched = Date.now()
      throw new UploadError(503, 'The connection dropped while sending. Resuming…', { received: upload.received })
    } finally {
      upload.active = null
      settle()
    }
  }

  async function complete(id, owner) {
    const upload = await get(id, owner)
    // Finishing twice (the first reply got lost) returns the same result.
    if (upload.done) return { name: upload.done }
    if (upload.active) await upload.active.settled
    if (upload.received !== upload.size) {
      throw new UploadError(409, 'Upload is incomplete', { received: upload.received })
    }
    for (let n = 1; n <= MAX_NAME_ATTEMPTS; n++) {
      const name = numberedName(upload.name, n)
      try {
        await link(upload.partPath, path.join(upload.folderPath, name))
        await unlink(upload.partPath)
        upload.done = name
        upload.touched = Date.now()
        await saveMeta(upload).catch(() => {})
        return { name }
      } catch (err) {
        if (err.code !== 'EEXIST') throw err
      }
    }
    throw new UploadError(409, 'Too many files with this name')
  }

  // Removes this server's own abandoned or finished uploads after a day.
  async function sweep(now = Date.now()) {
    for (const upload of uploads.values()) {
      if (!upload.active && now - upload.touched > STALE_AFTER_MS) await discard(upload)
    }
    const names = await readdir(partsDir).catch(() => [])
    for (const name of names) {
      if (!/\.(part|json)$/.test(name)) continue
      if (uploads.has(name.replace(/\.(part|json)$/, ''))) continue
      const full = path.join(partsDir, name)
      const info = await stat(full).catch(() => null)
      if (info && now - info.mtimeMs > STALE_AFTER_MS) await unlink(full).catch(() => {})
    }
  }

  return { start, status, appendChunk, complete, sweep }
}
