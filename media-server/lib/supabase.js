// Talks to Supabase with the public anon key only. Logins are checked by asking
// Supabase who owns the token, and share links are resolved through a
// security-definer function, so this server never holds a service-role key.

const USER_CACHE_MS = 60_000
const SHARE_CACHE_MS = 30_000
const MAX_CACHE_ENTRIES = 500

function createCache(ttlMs) {
  const entries = new Map()
  return {
    get(key) {
      const hit = entries.get(key)
      if (!hit) return undefined
      if (Date.now() > hit.expires) { entries.delete(key); return undefined }
      return hit.value
    },
    set(key, value) {
      if (entries.size >= MAX_CACHE_ENTRIES) entries.delete(entries.keys().next().value)
      entries.set(key, { value, expires: Date.now() + ttlMs })
    },
  }
}

export function createSupabaseClient({ url, anonKey, fetchImpl = fetch }) {
  const users = createCache(USER_CACHE_MS)
  const shares = createCache(SHARE_CACHE_MS)
  const base = url.replace(/\/+$/, '')

  // Platform role, read with the user's own token (profiles are readable by
  // any signed-in user under RLS). Defaults to 'member'.
  async function roleOf(id, token) {
    const res = await fetchImpl(`${base}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=role`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return 'member'
    const rows = await res.json()
    return rows?.[0]?.role ?? 'member'
  }

  // Returns { id, role } for a valid platform session token, otherwise null.
  async function userFromToken(token) {
    if (!token) return null
    const cached = users.get(token)
    if (cached !== undefined) return cached
    const res = await fetchImpl(`${base}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    })
    if (res.status >= 500) throw new Error(`Supabase auth returned ${res.status}`)
    const body = res.ok ? await res.json() : null
    const user = body?.id ? { id: body.id, role: await roleOf(body.id, token) } : null
    users.set(token, user)
    return user
  }

  // Returns { folder, title } for an active share link, otherwise null.
  async function resolveShare(token) {
    if (!/^[a-f0-9]{32,128}$/.test(token ?? '')) return null
    const cached = shares.get(token)
    if (cached !== undefined) return cached
    const res = await fetchImpl(`${base}/rest/v1/rpc/resolve_media_share`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: token }),
    })
    if (!res.ok) throw new Error(`Share lookup returned ${res.status}`)
    const rows = await res.json()
    const row = Array.isArray(rows) ? rows[0] : rows
    const share = row?.folder
      ? { folder: row.folder, title: row.segment_title ?? row.folder, finalsOnly: Boolean(row.finals_only), finals: row.finals ?? [] }
      : null
    shares.set(token, share)
    return share
  }

  return { userFromToken, resolveShare }
}
