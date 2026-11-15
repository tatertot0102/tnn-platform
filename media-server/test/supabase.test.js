import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSupabaseClient } from '../lib/supabase.js'

function fakeFetch(routes) {
  const calls = []
  const impl = async (url, init = {}) => {
    calls.push({ url, init })
    const route = routes[new URL(url).pathname]
    return route(init)
  }
  return { impl, calls }
}

const json = (status, body) => ({ ok: status < 400, status, json: async () => body })

test('userFromToken returns the user id and caches the answer', async () => {
  const { impl, calls } = fakeFetch({
    '/auth/v1/user': () => json(200, { id: 'u1' }),
    '/rest/v1/profiles': () => json(200, [{ role: 'exec' }]),
  })
  const client = createSupabaseClient({ url: 'https://x.supabase.co/', anonKey: 'anon', fetchImpl: impl })
  assert.deepEqual(await client.userFromToken('t'), { id: 'u1', role: 'exec' })
  assert.deepEqual(await client.userFromToken('t'), { id: 'u1', role: 'exec' })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].init.headers.Authorization, 'Bearer t')
  assert.equal(calls[1].init.headers.Authorization, 'Bearer t')
})

test('userFromToken treats a missing profile as a member', async () => {
  const { impl } = fakeFetch({
    '/auth/v1/user': () => json(200, { id: 'u2' }),
    '/rest/v1/profiles': () => json(200, []),
  })
  const client = createSupabaseClient({ url: 'https://x', anonKey: 'a', fetchImpl: impl })
  assert.deepEqual(await client.userFromToken('t'), { id: 'u2', role: 'member' })
})

test('userFromToken rejects bad tokens and surfaces outages', async () => {
  const bad = createSupabaseClient({ url: 'https://x', anonKey: 'a', fetchImpl: fakeFetch({ '/auth/v1/user': () => json(401, {}) }).impl })
  assert.equal(await bad.userFromToken('t'), null)
  assert.equal(await bad.userFromToken(''), null)
  const down = createSupabaseClient({ url: 'https://x', anonKey: 'a', fetchImpl: fakeFetch({ '/auth/v1/user': () => json(503, {}) }).impl })
  await assert.rejects(() => down.userFromToken('t'))
})

test('resolveShare maps the RPC row and ignores malformed tokens', async () => {
  const token = 'c'.repeat(48)
  const { impl, calls } = fakeFetch({
    '/rest/v1/rpc/resolve_media_share': init => {
      const { p_token } = JSON.parse(init.body)
      return json(200, p_token === token ? [{ folder: 'Seg A', segment_title: 'Segment A', finals_only: true, finals: ['Seg A/f.mp4'] }] : [])
    },
  })
  const client = createSupabaseClient({ url: 'https://x', anonKey: 'anon', fetchImpl: impl })
  assert.deepEqual(await client.resolveShare(token), { folder: 'Seg A', title: 'Segment A', finalsOnly: true, finals: ['Seg A/f.mp4'] })
  assert.equal(await client.resolveShare('d'.repeat(48)), null)
  assert.equal(await client.resolveShare('../../etc'), null)
  assert.equal(calls.length, 2)
})
