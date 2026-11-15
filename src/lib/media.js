import { supabase } from './supabase'
import { resumableUpload } from './mediaUpload'

// Segment media lives on the TNN media server (the Mac). The platform talks to
// it with the signed-in user's Supabase token; share links use their own token.
export const MEDIA_URL = (import.meta.env.VITE_MEDIA_API_URL || '').replace(/\/+$/, '')
export const isMediaConfigured = Boolean(MEDIA_URL)

export class MediaError extends Error {}

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new MediaError('Your session expired. Sign in again.')
  return { Authorization: `Bearer ${token}` }
}

async function request(path, { method = 'GET', body, headers = {}, signal, auth = true } = {}) {
  if (!isMediaConfigured) throw new MediaError('Media server is not set up yet.')
  let res
  try {
    res = await fetch(`${MEDIA_URL}${path}`, {
      method, body, signal,
      headers: { ...(auth ? await authHeader() : {}), ...headers },
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new MediaError('Can’t reach the media server. The Mac may be asleep or offline.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new MediaError(data.error || `Media server error (${res.status})`)
  return data
}

const json = value => ({ body: JSON.stringify(value), headers: { 'Content-Type': 'application/json' } })
const enc = encodeURIComponent

// ── Media server ──

export const joinPath = (...parts) => parts.filter(Boolean).join('/')

export const listFolders = () => request('/api/folders').then(d => d.folders)
export const listPath = path => request(`/api/list?path=${enc(path)}`)
// Creates a folder (numbered if the name is taken) and returns its full path.
export const createFolder = (name, parent = '') =>
  request('/api/folders', { method: 'POST', ...json({ parent, name }) }).then(d => d.path)
// Returns the path of parent/name, creating the folder only if it's missing.
export const ensureFolder = (parent, name) =>
  request('/api/folders', { method: 'POST', ...json({ parent, name, ensure: true }) }).then(d => d.path)
export const getFile = path => request(`/api/file?path=${enc(path)}`)
export const renameItem = (path, name) =>
  request('/api/rename', { method: 'POST', ...json({ path, name }) }).then(d => d.path)
export const trashItems = paths =>
  request('/api/trash', { method: 'POST', ...json({ paths }) }).then(d => d.trashed)
export const getShare = (token, path = '') => request(`/share/${enc(token)}?path=${enc(path)}`, { auth: false })

/**
 * Uploads a file in resumable chunks (Cloudflare caps a request at 100 MB).
 * See resumableUpload for the options.
 * @returns {Promise<string>} the saved file name (numbered if the name was taken)
 */
export function uploadFile(folder, file, options) {
  if (!isMediaConfigured) return Promise.reject(new MediaError('Media server is not set up yet.'))
  return resumableUpload(MEDIA_URL, folder, file, options)
}

// ── Supabase: segment ↔ folder and share links ──

export async function getSegmentFolder(segmentId) {
  const { data, error } = await supabase.from('segment_media').select('folder')
    .eq('segment_id', segmentId).maybeSingle()
  if (error) throw error
  return data?.folder ?? null
}

// Inserts the first link, or re-points it (execs only, enforced by RLS).
export async function linkSegmentFolder(segmentId, folder, { replace = false } = {}) {
  const query = replace
    ? supabase.from('segment_media').update({ folder, updated_at: new Date().toISOString() }).eq('segment_id', segmentId)
    : supabase.from('segment_media').insert({ segment_id: segmentId, folder })
  const { error } = await query
  if (error) throw error
  return folder
}

// Creates "<segment title>" (numbered if taken) and links it. Used right after
// a segment is created and from the Media tab's setup card.
export async function createSegmentFolder(segmentId, title) {
  const folder = await createFolder(title)
  return linkSegmentFolder(segmentId, folder)
}

// Folder -> segment titles, for labelling folders on the Media page.
export async function listSegmentFolders() {
  const { data, error } = await supabase.from('segment_media').select('folder, segment_id, segments(title)')
  if (error) throw error
  return data.reduce((map, row) => ({ ...map, [row.folder]: [...(map[row.folder] ?? []), { id: row.segment_id, title: row.segments?.title }] }), {})
}

// Keeps segments pointing at a top-level folder after it is renamed (execs only).
export async function relinkFolder(oldName, newName) {
  const { error } = await supabase.from('segment_media')
    .update({ folder: newName, updated_at: new Date().toISOString() }).eq('folder', oldName)
  if (error) throw error
}

// Starts browser downloads one after another (spaced out so browsers allow them).
export function downloadAll(urls, gapMs = 600) {
  urls.forEach((url, i) => setTimeout(() => {
    const a = document.createElement('a')
    a.href = url
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }, i * gapMs))
}

export async function listShareLinks(segmentId) {
  const { data, error } = await supabase.from('media_share_links')
    .select('id, token, label, created_by, created_at, expires_at, revoked_at, finals_only, profiles:created_by(full_name)')
    .eq('segment_id', segmentId).is('revoked_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  const now = Date.now()
  return data.filter(l => !l.expires_at || new Date(l.expires_at).getTime() > now)
}

export async function createShareLink(segmentId, { label, expiresInDays, finalsOnly = false }) {
  const expires_at = expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString() : null
  const { data, error } = await supabase.from('media_share_links')
    .insert({ segment_id: segmentId, label: label?.trim() || null, expires_at, finals_only: finalsOnly })
    .select('id, token, label, created_at, expires_at, revoked_at, finals_only').single()
  if (error) throw error
  return data
}

export async function revokeShareLink(id) {
  const { error } = await supabase.from('media_share_links')
    .update({ revoked_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export const shareUrl = token => `${window.location.origin}/s/${token}`

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++ }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

// Where a FileBrowser reads from: the whole server (or one folder of it) for
// signed-in members, or a share link for everyone else.
export const memberSource = (rootPath = '') => ({
  key: `m:${rootPath}`,
  list: sub => listPath(joinPath(rootPath, sub)),
  full: sub => joinPath(rootPath, sub),
})

export const shareSource = token => ({
  key: `s:${token}`,
  list: sub => getShare(token, sub),
})
