import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readdir, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const CONVERT_TIMEOUT_MS = 30 * 60 * 1000
const THUMB_TIMEOUT_MS = 60 * 1000
const THUMB_MAX_PX = 480

// Smaller copies are made with tools built into macOS, using the hardware
// encoder: avconvert for a 960x540 H.264 video (plays everywhere, ~5 Mbps
// instead of ~20), QuickLook for a video frame and sips for small JPEGs.
export const macTools = {
  async video(source, output) {
    await run('/usr/bin/avconvert', ['-s', source, '-p', 'Preset960x540', '-o', output, '--replace'], { timeout: CONVERT_TIMEOUT_MS })
  },
  async thumb(source, output, kind) {
    let image = source
    let scratch
    if (kind === 'video') {
      scratch = await mkdtemp(path.join(path.dirname(output), '.ql-'))
      await run('/usr/bin/qlmanage', ['-t', '-s', '720', '-o', scratch, source], { timeout: THUMB_TIMEOUT_MS })
      const [png] = (await readdir(scratch)).filter(n => n.endsWith('.png'))
      if (!png) throw new Error('QuickLook made no thumbnail')
      image = path.join(scratch, png)
    }
    try {
      await run('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '70', '-Z', String(THUMB_MAX_PX), image, '--out', output], { timeout: THUMB_TIMEOUT_MS })
    } finally {
      if (scratch) await rm(scratch, { recursive: true, force: true })
    }
  },
}

/**
 * Keeps a cache of previews outside the shared folder and builds missing ones
 * one at a time in the background. Nothing in the shared folder is modified.
 * @param {{ cacheDir: string, tools?: typeof macTools, onError?: (err: Error, rel: string) => void }} options
 */
export function createPreviewer({ cacheDir, tools = macTools, onError = () => {} }) {
  const queue = []
  const pending = new Set()
  const failed = new Map() // rel -> source mtime that failed, so we don't retry forever
  let working = null

  const keyOf = rel => createHash('sha1').update(rel).digest('hex')
  const pathsFor = rel => {
    const key = keyOf(rel)
    return { video: path.join(cacheDir, `${key}.mp4`), thumb: path.join(cacheDir, `${key}.jpg`) }
  }

  async function freshness(file, sourceMtimeMs) {
    const info = await stat(file).catch(() => null)
    return Boolean(info && info.mtimeMs >= sourceMtimeMs)
  }

  // What exists right now for a file. kind is 'video' | 'image' | other.
  async function status(rel, kind, sourceInfo) {
    if (kind !== 'video' && kind !== 'image') return { video: 'none', thumb: 'none' }
    const out = pathsFor(rel)
    const thumbReady = await freshness(out.thumb, sourceInfo.mtimeMs)
    const videoReady = kind === 'video' ? await freshness(out.video, sourceInfo.mtimeMs) : false
    const busy = working === rel ? 'working' : pending.has(rel) ? 'queued' : null
    const didFail = failed.get(rel) === sourceInfo.mtimeMs
    const state = ready => (ready ? 'ready' : didFail ? 'failed' : busy ?? 'missing')
    return { video: kind === 'video' ? state(videoReady) : 'none', thumb: state(thumbReady) }
  }

  function enqueue(rel, absPath, kind, sourceInfo) {
    if (pending.has(rel) || working === rel || failed.get(rel) === sourceInfo.mtimeMs) return
    pending.add(rel)
    queue.push({ rel, absPath, kind, mtimeMs: sourceInfo.mtimeMs })
    drain()
  }

  async function build(job) {
    await mkdir(cacheDir, { recursive: true })
    const out = pathsFor(job.rel)
    const tmp = suffix => path.join(cacheDir, `.${keyOf(job.rel)}.tmp${suffix}`)
    if (!(await freshness(out.thumb, job.mtimeMs))) {
      await tools.thumb(job.absPath, tmp('.jpg'), job.kind)
      await rename(tmp('.jpg'), out.thumb)
    }
    if (job.kind === 'video' && !(await freshness(out.video, job.mtimeMs))) {
      await tools.video(job.absPath, tmp('.mp4'))
      await rename(tmp('.mp4'), out.video)
    }
  }

  async function drain() {
    if (working) return
    while (queue.length) {
      const job = queue.shift()
      pending.delete(job.rel)
      working = job.rel
      try {
        await build(job)
        failed.delete(job.rel)
      } catch (err) {
        failed.set(job.rel, job.mtimeMs)
        onError(err, job.rel)
      }
      working = null
    }
  }

  // Resolves once the queue is empty (used by tests).
  async function idle() {
    while (working || queue.length) await new Promise(resolve => setTimeout(resolve, 10))
  }

  return { status, enqueue, pathsFor, idle, queueLength: () => queue.length + (working ? 1 : 0) }
}
