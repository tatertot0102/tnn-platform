import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { isSafeName } from './paths.js'

// Only these play inline in the browser. Everything else (html, svg, pdf…) is
// forced to download so an uploaded file can never run as a page on our origin.
const INLINE_TYPES = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.heic': 'image/heic',
}

export function mediaKind(name) {
  const type = INLINE_TYPES[path.extname(name).toLowerCase()]
  return type ? type.split('/')[0] : 'file'
}

// Visible subfolders and regular files directly inside a folder. Symlinks and
// hidden entries (including our own .tnn-* folders) are left out.
export async function listDir(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const visible = entries.filter(e => isSafeName(e.name) && (e.isFile() || e.isDirectory()))
  const withInfo = await Promise.all(visible.map(async e => {
    const info = await stat(path.join(dir, e.name))
    return { name: e.name, isDir: e.isDirectory(), info }
  }))
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  return {
    folders: withInfo.filter(e => e.isDir).sort(byName)
      .map(e => ({ name: e.name, modified: e.info.mtime.toISOString() })),
    files: withInfo.filter(e => !e.isDir).sort(byName)
      .map(e => ({ name: e.name, size: e.info.size, modified: e.info.mtime.toISOString(), kind: mediaKind(e.name), info: e.info })),
  }
}

// Parses a single "bytes=" range. Returns null for no/invalid range headers so
// the whole file is sent, or { start, end } (inclusive) otherwise.
export function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? '')
  if (!match || (match[1] === '' && match[2] === '')) return null
  let start
  let end
  if (match[1] === '') {
    start = Math.max(0, size - Number(match[2]))
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  }
  if (start > end || start >= size) return { invalid: true }
  return { start, end }
}

function contentDisposition(name, attachment) {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_')
  return `${attachment ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

// Streams a file with HTTP range support so videos can seek.
export function sendFile(req, res, file, { download = false, name: downloadName } = {}) {
  const { path: filePath, info } = file
  const name = downloadName ?? path.basename(filePath)
  const inlineType = INLINE_TYPES[path.extname(filePath).toLowerCase()]
  const attachment = download || !inlineType
  const headers = {
    'Content-Type': inlineType ?? 'application/octet-stream',
    'Content-Disposition': contentDisposition(name, attachment),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
    'Last-Modified': info.mtime.toUTCString(),
  }

  const range = parseRange(req.headers.range, info.size)
  if (range?.invalid) {
    res.writeHead(416, { 'Content-Range': `bytes */${info.size}` })
    return res.end()
  }
  const start = range?.start ?? 0
  const end = range?.end ?? info.size - 1
  const status = range ? 206 : 200
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`
  headers['Content-Length'] = info.size === 0 ? 0 : end - start + 1

  res.writeHead(status, headers)
  if (req.method === 'HEAD' || info.size === 0) return res.end()
  const stream = createReadStream(filePath, { start, end })
  stream.on('error', () => res.destroy())
  res.on('close', () => stream.destroy())
  stream.pipe(res)
}
