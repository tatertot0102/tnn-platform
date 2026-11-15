import { lstat, realpath } from 'node:fs/promises'
import path from 'node:path'

const MAX_NAME_LENGTH = 200
// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const FORBIDDEN_CHARS = /[/\\:\0-\x1f\x7f]/

// A single path segment that is safe to join onto the media root: no
// separators, no traversal, no hidden files and no control characters.
export function isSafeName(name) {
  if (typeof name !== 'string') return false
  if (!name || name.length > MAX_NAME_LENGTH) return false
  if (name.startsWith('.')) return false
  if (name !== name.trim()) return false
  return !FORBIDDEN_CHARS.test(name)
}

// Turns a segment title (or anything a person typed) into a folder name that
// passes isSafeName, or '' when nothing usable is left.
export function toFolderName(raw) {
  return String(raw ?? '')
    // eslint-disable-next-line no-control-regex -- strip control characters from names
    .replace(/[/\\:\0-\x1f\x7f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 100)
    .trim()
}

// "clip.mp4" -> "clip (2).mp4", "Folder" -> "Folder (2)".
export function numberedName(name, n) {
  if (n < 2) return name
  const ext = path.extname(name)
  const base = ext && ext !== name ? name.slice(0, -ext.length) : name
  const suffix = ext && ext !== name ? ext : ''
  return `${base} (${n})${suffix}`
}

// Resolves root/…segments to a real path and refuses anything that escapes
// the root or goes through a symlink. Returns null for unsafe or missing paths.
export async function resolveInside(root, ...segments) {
  if (!segments.every(isSafeName)) return null
  const realRoot = await realpath(root)
  const target = path.join(realRoot, ...segments)
  try {
    const info = await lstat(target)
    if (info.isSymbolicLink()) return null
    const real = await realpath(target)
    if (real !== target || !real.startsWith(realRoot + path.sep)) return null
    return { path: real, info }
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

// "A/B/c.mp4" -> ['A', 'B', 'c.mp4']; '' -> []. Returns null if any part is unsafe.
export function parsePath(value) {
  if (value === undefined || value === null || value === '') return []
  if (typeof value !== 'string' || value.length > 1000) return null
  const parts = value.split('/')
  return parts.every(isSafeName) ? parts : null
}

// True when `rel` is `base` itself or somewhere inside it.
export function isWithin(base, rel) {
  return rel === base || rel.startsWith(`${base}/`)
}
