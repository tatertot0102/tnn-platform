import { mkdir, realpath, rename, stat } from 'node:fs/promises'
import path from 'node:path'
import { isSafeName, isWithin, numberedName, parsePath, resolveInside, toFolderName } from './lib/paths.js'
import { listDir, mediaKind, sendFile } from './lib/files.js'
import { signFile, verifyFile } from './lib/sign.js'
import { UploadError } from './lib/uploads.js'

const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60
const MAX_JSON_BYTES = 64 * 1024
const MAX_NAME_ATTEMPTS = 500
const MAX_BATCH = 500
const VARIANTS = new Set(['orig', 'preview', 'thumb'])
const EXEC_ROLES = new Set(['exec', 'admin'])

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_JSON_BYTES) throw new HttpError(413, 'Request body too large')
    chunks.push(chunk)
  }
  try {
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
  } catch {
    throw new HttpError(400, 'Invalid JSON')
  }
}

function partsOr400(value) {
  const parts = parsePath(value)
  if (!parts) throw new HttpError(400, 'Path is not valid')
  return parts
}

const compressedName = name => `${name.replace(/\.[^.]+$/, '')} (compressed).mp4`

/**
 * Builds the request handler. Everything it touches is passed in so tests can
 * run it against temp folders, a fake Supabase and fake preview tools.
 */
export function createApp({ root, secret, publicUrl, allowedOrigins, supabase, uploads, previews }) {
  const origins = new Set(allowedOrigins)

  function applyCors(req, res) {
    const origin = req.headers.origin
    if (origin && origins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
      res.setHeader('Access-Control-Max-Age', '600')
    }
  }

  async function requireUser(req) {
    const header = req.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    const user = await supabase.userFromToken(token)
    if (!user) throw new HttpError(401, 'Sign in to the platform to use media')
    return { ...user, isExec: EXEC_ROLES.has(user.role) }
  }

  async function dirOr404(parts) {
    if (!parts.length) return { path: await realpath(root) }
    const dir = await resolveInside(root, ...parts)
    if (!dir || !dir.info.isDirectory()) throw new HttpError(404, 'Folder not found')
    return dir
  }

  // ── Listing: files get URLs for each variant plus preview status ──

  async function describe(dirParts, file, urlFor) {
    const rel = [...dirParts, file.name].join('/')
    const status = await previews.status(rel, file.kind, file.info)
    if (status.thumb === 'missing' || status.video === 'missing') {
      const abs = path.join(root, ...dirParts, file.name)
      previews.enqueue(rel, abs, file.kind, file.info)
    }
    const { info: _info, ...rest } = file
    const orig = urlFor(rel, 'orig')
    const out = { ...rest, url: orig, downloadUrl: `${orig}&dl=1`, preview: status.video, thumb: status.thumb }
    if (status.thumb === 'ready') out.thumbUrl = urlFor(rel, 'thumb')
    if (status.video === 'ready') {
      out.previewUrl = urlFor(rel, 'preview')
      out.previewDownloadUrl = `${out.previewUrl}&dl=1`
    }
    return out
  }

  async function listing(dirParts, urlFor) {
    const dir = await dirOr404(dirParts)
    const { folders, files } = await listDir(dir.path)
    return { folders, files: await Promise.all(files.map(f => describe(dirParts, f, urlFor))) }
  }

  const memberUrl = (rel, variant) => {
    const { exp, sig } = signFile(secret, rel, variant, SIGNED_URL_TTL_SECONDS)
    return `${publicUrl}/raw?p=${encodeURIComponent(rel)}&v=${variant}&exp=${exp}&sig=${sig}`
  }

  // Sends the original, the compressed preview or the thumbnail for a path.
  async function sendVariant(req, res, rel, variant, download) {
    if (!VARIANTS.has(variant)) throw new HttpError(400, 'Unknown variant')
    const parts = partsOr400(rel)
    const source = parts.length ? await resolveInside(root, ...parts) : null
    if (!source || !source.info.isFile()) throw new HttpError(404, 'File not found')
    if (variant === 'orig') return sendFile(req, res, source, { download })

    const cachePath = previews.pathsFor(rel)[variant === 'thumb' ? 'thumb' : 'video']
    const info = await stat(cachePath).catch(() => null)
    if (!info || info.mtimeMs < source.info.mtimeMs) throw new HttpError(404, 'Preview is still being prepared')
    const name = variant === 'preview' ? compressedName(parts.at(-1)) : undefined
    return sendFile(req, res, { path: cachePath, info }, { download, name })
  }

  // ── Changes ──

  async function createFolder(parentParts, rawName, { ensure = false } = {}) {
    const base = toFolderName(rawName)
    if (!isSafeName(base)) throw new HttpError(400, 'Folder name is not valid')
    const parent = await dirOr404(parentParts)
    // "ensure" returns an existing folder of that name instead of numbering.
    if (ensure) {
      const existing = await resolveInside(root, ...parentParts, base)
      if (existing?.info.isDirectory()) return [...parentParts, base].join('/')
    }
    for (let n = 1; n <= MAX_NAME_ATTEMPTS; n++) {
      const name = numberedName(base, n)
      try {
        await mkdir(path.join(parent.path, name))
        return [...parentParts, name].join('/')
      } catch (err) {
        if (err.code !== 'EEXIST') throw err
      }
    }
    throw new HttpError(409, 'Too many folders with this name')
  }

  async function renameItem(user, rel, newName) {
    const parts = partsOr400(rel)
    if (!parts.length) throw new HttpError(400, 'Choose something to rename')
    if (parts.length === 1 && !user.isExec) throw new HttpError(403, 'Only execs can rename top-level folders')
    if (!isSafeName(newName)) throw new HttpError(400, 'That name is not allowed')
    const item = await resolveInside(root, ...parts)
    if (!item) throw new HttpError(404, 'Not found')
    const target = path.join(path.dirname(item.path), newName)
    if (await stat(target).then(() => true, () => false)) throw new HttpError(409, 'Something with that name already exists')
    await rename(item.path, target)
    return [...parts.slice(0, -1), newName].join('/')
  }

  // "Delete" moves items into a hidden, dated .tnn-trash folder in the media
  // root, keeping their paths, so anything can be put back by hand.
  async function trashItems(user, rels) {
    if (!user.isExec) throw new HttpError(403, 'Only execs can delete')
    if (!Array.isArray(rels) || !rels.length || rels.length > MAX_BATCH) throw new HttpError(400, 'Choose what to delete')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const moved = []
    for (const rel of rels) {
      const parts = partsOr400(rel)
      const item = parts.length ? await resolveInside(root, ...parts) : null
      if (!item) continue
      const dest = path.join(root, '.tnn-trash', stamp, ...parts)
      await mkdir(path.dirname(dest), { recursive: true })
      await rename(item.path, dest)
      moved.push(rel)
    }
    return moved
  }

  // ── Routes ──

  async function memberRoutes(req, res, parts, url) {
    const user = await requireUser(req)
    const [, resource, id, action] = parts
    const route = `${req.method} ${resource}${id ? '/:id' : ''}${action ? `/${action}` : ''}`

    switch (route) {
      case 'GET list':
        return sendJson(res, 200, await listing(partsOr400(url.searchParams.get('path')), memberUrl))
      case 'GET folders': {
        const { folders } = await listDir((await dirOr404([])).path)
        return sendJson(res, 200, { folders })
      }
      case 'POST folders': {
        const { parent = '', name, ensure = false } = await readJson(req)
        const created = await createFolder(partsOr400(parent), name, { ensure: ensure === true })
        return sendJson(res, 201, { name: created.split('/').at(-1), path: created })
      }
      case 'GET file': {
        const rel = url.searchParams.get('path')
        const parts = partsOr400(rel)
        const item = parts.length ? await resolveInside(root, ...parts) : null
        if (!item || !item.info.isFile()) throw new HttpError(404, 'File not found')
        const name = parts.at(-1)
        const file = { name, size: item.info.size, modified: item.info.mtime.toISOString(), kind: mediaKind(name), info: item.info }
        return sendJson(res, 200, await describe(parts.slice(0, -1), file, memberUrl))
      }
      case 'POST rename': {
        const body = await readJson(req)
        return sendJson(res, 200, { path: await renameItem(user, body.path, body.name) })
      }
      case 'POST trash': {
        const { paths } = await readJson(req)
        return sendJson(res, 200, { trashed: await trashItems(user, paths) })
      }
      case 'POST uploads': {
        const { folder = '', name, size } = await readJson(req)
        const folderParts = partsOr400(folder)
        if (!folderParts.length) throw new HttpError(400, 'Upload into a folder')
        if (!isSafeName(name)) throw new HttpError(400, 'File name is not valid')
        const dir = await dirOr404(folderParts)
        return sendJson(res, 201, await uploads.start({ folderPath: dir.path, name, size, owner: user.id }))
      }
      case 'GET uploads/:id':
        return sendJson(res, 200, await uploads.status(id, user.id))
      case 'PUT uploads/:id': {
        const offset = Number(url.searchParams.get('offset'))
        if (!Number.isSafeInteger(offset) || offset < 0) throw new HttpError(400, 'Offset is not valid')
        return sendJson(res, 200, await uploads.appendChunk(id, user.id, offset, req))
      }
      case 'POST uploads/:id/complete':
        return sendJson(res, 200, await uploads.complete(id, user.id))
      default:
        throw new HttpError(404, 'Not found')
    }
  }

  async function rawRoute(req, res, url) {
    const rel = url.searchParams.get('p')
    const variant = url.searchParams.get('v') ?? 'orig'
    if (!verifyFile(secret, rel, variant, url.searchParams.get('exp'), url.searchParams.get('sig'))) {
      throw new HttpError(403, 'This link has expired. Reload the page.')
    }
    return sendVariant(req, res, rel, variant, url.searchParams.has('dl'))
  }

  async function shareRoutes(req, res, parts, url) {
    const token = parts[1]
    const share = await supabase.resolveShare(token)
    if (!share) throw new HttpError(404, 'This share link is invalid, expired or turned off')
    const baseParts = partsOr400(share.folder)
    await dirOr404(baseParts)

    // Paths inside a share are relative to the shared folder.
    const inside = value => {
      const sub = partsOr400(value)
      const full = [...baseParts, ...sub].join('/')
      if (!isWithin(share.folder, full)) throw new HttpError(404, 'Not found')
      return { sub, full }
    }
    const shareUrl = (rel, variant) => {
      const sub = rel.slice(share.folder.length + 1)
      return `${publicUrl}/share/${token}/raw?p=${encodeURIComponent(sub)}&v=${variant}`
    }

    // "Final only" links see just the files marked final (and the folders
    // leading to them); everything else is hidden and unreachable.
    const finals = new Set(share.finals)
    const visibleFile = rel => !share.finalsOnly || finals.has(rel)
    const visibleFolder = rel => !share.finalsOnly || share.finals.some(f => f.startsWith(`${rel}/`))

    if (parts.length === 2) {
      const { sub, full } = inside(url.searchParams.get('path'))
      if (!visibleFolder(full) && full !== share.folder) throw new HttpError(404, 'Folder not found')
      const dirParts = [...baseParts, ...sub]
      const list = await listing(dirParts, shareUrl)
      const at = name => [...dirParts, name].join('/')
      return sendJson(res, 200, {
        title: share.title,
        finalsOnly: share.finalsOnly,
        folders: list.folders.filter(f => visibleFolder(at(f.name))),
        files: list.files.filter(f => visibleFile(at(f.name))),
      })
    }
    if (parts.length === 3 && parts[2] === 'raw') {
      const { sub, full } = inside(url.searchParams.get('p'))
      if (!sub.length || !visibleFile(full)) throw new HttpError(404, 'File not found')
      return sendVariant(req, res, full, url.searchParams.get('v') ?? 'orig', url.searchParams.has('dl'))
    }
    throw new HttpError(404, 'Not found')
  }

  return async function handle(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    applyCors(req, res)
    try {
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
      const url = new URL(req.url, 'http://localhost')
      const parts = url.pathname.split('/').filter(Boolean)
      const isRead = req.method === 'GET' || req.method === 'HEAD'

      if (url.pathname === '/health') return sendJson(res, 200, { ok: true, previewQueue: previews.queueLength() })
      if (parts[0] === 'api' && parts.length >= 2) return await memberRoutes(req, res, parts, url)
      if (parts[0] === 'raw' && parts.length === 1 && isRead) return await rawRoute(req, res, url)
      if (parts[0] === 'share' && parts.length >= 2 && isRead) return await shareRoutes(req, res, parts, url)
      throw new HttpError(404, 'Not found')
    } catch (err) {
      const status = err instanceof HttpError || err instanceof UploadError ? err.status : 500
      if (status === 500) console.error(`[media] ${req.method} ${req.url?.split('?')[0]} failed:`, err)
      const extra = err instanceof UploadError ? err.extra : {}
      if (!res.headersSent) sendJson(res, status, { error: status === 500 ? 'Something went wrong on the media server' : err.message, ...extra })
      else res.destroy()
    }
  }
}
