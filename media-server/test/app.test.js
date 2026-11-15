import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { Readable } from 'node:stream'
import { mkdtemp, mkdir, writeFile, readFile, readdir, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createApp } from '../app.js'
import { createUploadStore } from '../lib/uploads.js'
import { createPreviewer } from '../lib/previews.js'

const SHARE_TOKEN = 'a'.repeat(48)
const FINALS_TOKEN = 'c'.repeat(48)
const USERS = {
  'token-zane': { id: 'user-zane', role: 'admin' },
  'token-jack': { id: 'user-jack', role: 'member' },
}
const ORIGIN = 'https://platform.bthstnn.org'

let server
let base
let root
let previews

// Fake converters: copy the source so tests don't need macOS tools.
const fakeTools = {
  video: (source, output) => copyFile(source, output),
  thumb: (source, output) => writeFile(output, 'jpg'),
}

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'media-app-'))
  await mkdir(path.join(root, 'Seg A', 'Day 2'), { recursive: true })
  await mkdir(path.join(root, 'Seg B'))
  await writeFile(path.join(root, 'Seg A', 'clip.mp4'), '0123456789')
  await writeFile(path.join(root, 'Seg A', 'page.html'), '<script>alert(1)</script>')
  await writeFile(path.join(root, 'Seg A', 'Day 2', 'nested.mp4'), 'nested')
  await writeFile(path.join(root, 'Seg B', 'private.mp4'), 'secret')
  previews = createPreviewer({ cacheDir: await mkdtemp(path.join(tmpdir(), 'media-cache-')), tools: fakeTools })
  server = createServer(createApp({
    root, secret: 's'.repeat(40), publicUrl: 'http://media.test', allowedOrigins: [ORIGIN],
    supabase: {
      userFromToken: async token => USERS[token] ?? null,
      resolveShare: async token => {
        if (token === SHARE_TOKEN) return { folder: 'Seg A', title: 'Segment A', finalsOnly: false, finals: [] }
        if (token === FINALS_TOKEN) return { folder: 'Seg A', title: 'Segment A', finalsOnly: true, finals: ['Seg A/Day 2/nested.mp4'] }
        return null
      },
    },
    uploads: createUploadStore(root), previews,
  }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

after(() => server.close())

const api = (p, { token = 'token-zane', ...init } = {}) =>
  fetch(`${base}${p}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } })
const post = (p, body, token) => api(p, { token, method: 'POST', body: JSON.stringify(body) })
const local = url => url.replace('http://media.test', base)
const list = async (p = '') => (await api(`/api/list?path=${encodeURIComponent(p)}`)).json()

test('member API requires a platform login', async () => {
  assert.equal((await api('/api/list', { token: 'nope' })).status, 401)
})

test('lists folders and files, including nested folders', async () => {
  const top = await list()
  assert.deepEqual(top.folders.map(f => f.name), ['Seg A', 'Seg B'])
  const segA = await list('Seg A')
  assert.deepEqual(segA.folders.map(f => f.name), ['Day 2'])
  assert.deepEqual(segA.files.map(f => f.name), ['clip.mp4', 'page.html'])
  const nested = await list('Seg A/Day 2')
  assert.equal(nested.files[0].name, 'nested.mp4')
})

test('videos get a thumbnail and compressed preview prepared in the background', async () => {
  const first = (await list('Seg A')).files.find(f => f.name === 'clip.mp4')
  assert.ok(['missing', 'queued', 'working', 'ready'].includes(first.preview))
  await previews.idle()
  const clip = (await list('Seg A')).files.find(f => f.name === 'clip.mp4')
  assert.equal(clip.preview, 'ready')
  assert.equal(clip.thumb, 'ready')
  assert.equal(await (await fetch(local(clip.previewUrl))).text(), '0123456789')
  const dl = await fetch(local(clip.previewDownloadUrl))
  assert.match(dl.headers.get('content-disposition'), /attachment; filename="clip \(compressed\)\.mp4"/)
  assert.equal(await (await fetch(local(clip.thumbUrl))).text(), 'jpg')
  const html = (await list('Seg A')).files.find(f => f.name === 'page.html')
  assert.equal(html.preview, 'none')
})

test('originals stream with ranges and signatures are bound to one path and variant', async () => {
  const clip = (await list('Seg A')).files.find(f => f.name === 'clip.mp4')
  const ranged = await fetch(local(clip.url), { headers: { Range: 'bytes=2-4' } })
  assert.equal(ranged.status, 206)
  assert.equal(await ranged.text(), '234')
  assert.equal((await fetch(local(clip.url).replace('clip.mp4', 'page.html'))).status, 403)
  assert.equal((await fetch(local(clip.url).replace('v=orig', 'v=preview'))).status, 403)
})

test('non-media files are always sent as downloads', async () => {
  const page = (await list('Seg A')).files.find(f => f.name === 'page.html')
  const res = await fetch(local(page.url))
  assert.equal(res.headers.get('content-type'), 'application/octet-stream')
  assert.match(res.headers.get('content-disposition'), /^attachment/)
})

test('path traversal is refused', async () => {
  assert.equal((await api('/api/list?path=..%2Fetc')).status, 400)
  assert.equal((await api('/api/list?path=Seg%20A%2F..%2FSeg%20B')).status, 400)
  assert.equal((await api('/api/list?path=Nope')).status, 404)
})

test('creates numbered folders, including inside other folders', async () => {
  const make = body => post('/api/folders', body).then(r => r.json())
  assert.equal((await make({ name: 'New / Segment' })).path, 'New Segment')
  assert.equal((await make({ name: 'New Segment' })).path, 'New Segment (2)')
  assert.equal((await make({ parent: 'Seg A', name: 'Day 2' })).path, 'Seg A/Day 2 (2)')
  assert.equal((await post('/api/folders', { name: '///' })).status, 400)
})

test('rename never overwrites, and top-level folders need an exec', async () => {
  await writeFile(path.join(root, 'Seg B', 'a.mp4'), 'a')
  await writeFile(path.join(root, 'Seg B', 'b.mp4'), 'b')
  assert.equal((await post('/api/rename', { path: 'Seg B/a.mp4', name: 'b.mp4' })).status, 409)
  assert.equal((await post('/api/rename', { path: 'Seg B/a.mp4', name: '../x.mp4' })).status, 400)
  assert.equal((await (await post('/api/rename', { path: 'Seg B/a.mp4', name: 'c.mp4' }, 'token-jack')).json()).path, 'Seg B/c.mp4')
  assert.equal((await post('/api/rename', { path: 'Seg B', name: 'Seg Z' }, 'token-jack')).status, 403)
  assert.equal(await readFile(path.join(root, 'Seg B', 'b.mp4'), 'utf8'), 'b')
})

test('delete is exec-only and moves items to a recoverable trash', async () => {
  await writeFile(path.join(root, 'Seg B', 'old.mp4'), 'old')
  assert.equal((await post('/api/trash', { paths: ['Seg B/old.mp4'] }, 'token-jack')).status, 403)
  const res = await (await post('/api/trash', { paths: ['Seg B/old.mp4'] })).json()
  assert.deepEqual(res.trashed, ['Seg B/old.mp4'])
  const [stamp] = await readdir(path.join(root, '.tnn-trash'))
  assert.equal(await readFile(path.join(root, '.tnn-trash', stamp, 'Seg B', 'old.mp4'), 'utf8'), 'old')
  assert.ok(!(await list()).folders.some(f => f.name.startsWith('.')))
})

async function upload(folder, name, content, token = 'token-zane') {
  const start = await post('/api/uploads', { folder, name, size: Buffer.byteLength(content) }, token)
  const { uploadId } = await start.json()
  await api(`/api/uploads/${uploadId}?offset=0`, { token, method: 'PUT', body: content })
  return api(`/api/uploads/${uploadId}/complete`, { token, method: 'POST' })
}

test('uploads land in nested folders and never overwrite', async () => {
  assert.equal((await (await upload('Seg A', 'clip.mp4', 'new')).json()).name, 'clip (2).mp4')
  assert.equal(await readFile(path.join(root, 'Seg A', 'clip.mp4'), 'utf8'), '0123456789')
  assert.equal((await (await upload('Seg A/Day 2', 'n.mp4', 'n')).json()).name, 'n.mp4')
  assert.equal((await post('/api/uploads', { folder: '', name: 'x.mp4', size: 1 })).status, 400)
})

test('uploads reject bad names, wrong offsets and other users', async () => {
  assert.equal((await post('/api/uploads', { folder: 'Seg A', name: '../x.mp4', size: 1 })).status, 400)
  const { uploadId } = await (await post('/api/uploads', { folder: 'Seg A', name: 'x.mp4', size: 3 })).json()
  assert.equal((await api(`/api/uploads/${uploadId}?offset=0`, { token: 'token-jack', method: 'PUT', body: 'abc' })).status, 404)
  assert.equal((await api(`/api/uploads/${uploadId}?offset=1`, { method: 'PUT', body: 'bc' })).status, 409)
  assert.equal((await api(`/api/uploads/${uploadId}/complete`, { method: 'POST' })).status, 409)
})

test('share links browse only inside their folder, read-only', async () => {
  const share = await (await fetch(`${base}/share/${SHARE_TOKEN}`)).json()
  assert.equal(share.title, 'Segment A')
  assert.ok(share.folders.some(f => f.name === 'Day 2'))
  const clip = share.files.find(f => f.name === 'clip.mp4')
  assert.equal(await (await fetch(local(clip.url))).text(), '0123456789')

  const nested = await (await fetch(`${base}/share/${SHARE_TOKEN}?path=Day%202`)).json()
  assert.ok(nested.files.some(f => f.name === 'nested.mp4'))

  assert.equal((await fetch(`${base}/share/${SHARE_TOKEN}?path=..%2FSeg%20B`)).status, 400)
  assert.equal((await fetch(`${base}/share/${SHARE_TOKEN}/raw?p=..%2FSeg%20B%2Fprivate.mp4`)).status, 400)
  assert.equal((await fetch(`${base}/share/${SHARE_TOKEN}/raw?p=`)).status, 404)
  assert.equal((await fetch(`${base}/share/${'b'.repeat(48)}`)).status, 404)
  assert.equal((await fetch(`${base}/share/${SHARE_TOKEN}/raw?p=clip.mp4`, { method: 'PUT', body: 'x' })).status, 404)
})

test('CORS is only granted to the platform origin', async () => {
  const ok = await fetch(`${base}/api/list`, { method: 'OPTIONS', headers: { Origin: ORIGIN } })
  assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN)
  const evil = await fetch(`${base}/api/list`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } })
  assert.equal(evil.headers.get('access-control-allow-origin'), null)
})

test('"final only" share links see only final files and the folders leading to them', async () => {
  const top = await (await fetch(`${base}/share/${FINALS_TOKEN}`)).json()
  assert.equal(top.finalsOnly, true)
  assert.deepEqual(top.files, [])
  assert.deepEqual(top.folders.map(f => f.name), ['Day 2'])
  const day2 = await (await fetch(`${base}/share/${FINALS_TOKEN}?path=Day%202`)).json()
  assert.deepEqual(day2.files.map(f => f.name), ['nested.mp4'])
  assert.equal(await (await fetch(local(day2.files[0].url))).text(), 'nested')
  assert.equal((await fetch(`${base}/share/${FINALS_TOKEN}/raw?p=clip.mp4`)).status, 404)
  assert.equal((await fetch(`${base}/share/${FINALS_TOKEN}?path=Day%202%20(2)`)).status, 404)
})

test('single-file lookup returns signed URLs', async () => {
  const file = await (await api('/api/file?path=Seg%20A%2Fclip.mp4')).json()
  assert.equal(file.name, 'clip.mp4')
  assert.equal(await (await fetch(local(file.url))).text(), '0123456789')
  assert.equal((await api('/api/file?path=Seg%20A')).status, 404)
})

test('ensure returns an existing folder instead of numbering a new one', async () => {
  const a = await (await post('/api/folders', { parent: 'Seg B', name: 'Drafts', ensure: true })).json()
  const b = await (await post('/api/folders', { parent: 'Seg B', name: 'Drafts', ensure: true })).json()
  assert.equal(a.path, 'Seg B/Drafts')
  assert.equal(b.path, 'Seg B/Drafts')
})

// Sends part of a chunk, then cuts the connection like a phone losing signal.
function droppedChunk(uploadId, offset, partial) {
  return new Promise(resolve => {
    const req = request(`${base}/api/uploads/${uploadId}?offset=${offset}`, {
      method: 'PUT', headers: { Authorization: 'Bearer token-zane', 'Content-Length': 1000 },
    })
    req.on('error', () => resolve())
    req.write(partial, () => setTimeout(() => { req.destroy(); resolve() }, 50))
  })
}

const startUpload = async (name, size) =>
  (await (await post('/api/uploads', { folder: 'Seg B', name, size })).json()).uploadId
const uploadStatus = async id => (await api(`/api/uploads/${id}`)).json()

test('a dropped chunk keeps the upload, which resumes from the last whole chunk', async () => {
  const id = await startUpload('resume.mp4', 10)
  assert.equal((await api(`/api/uploads/${id}?offset=0`, { method: 'PUT', body: 'abcd' })).status, 200)
  await droppedChunk(id, 4, 'ef')
  assert.equal((await uploadStatus(id)).received, 4)
  assert.equal((await api(`/api/uploads/${id}?offset=4`, { method: 'PUT', body: 'efghij' })).status, 200)
  assert.equal((await (await api(`/api/uploads/${id}/complete`, { method: 'POST' })).json()).name, 'resume.mp4')
  assert.equal(await readFile(path.join(root, 'Seg B', 'resume.mp4'), 'utf8'), 'abcdefghij')
})

test('a wrong offset says where to carry on from', async () => {
  const id = await startUpload('offset.mp4', 4)
  await api(`/api/uploads/${id}?offset=0`, { method: 'PUT', body: 'ab' })
  const res = await api(`/api/uploads/${id}?offset=0`, { method: 'PUT', body: 'ab' })
  assert.equal(res.status, 409)
  assert.equal((await res.json()).received, 2)
})

test('finishing twice returns the same file instead of an error', async () => {
  const id = await startUpload('twice.mp4', 1)
  await api(`/api/uploads/${id}?offset=0`, { method: 'PUT', body: 'x' })
  const first = await (await api(`/api/uploads/${id}/complete`, { method: 'POST' })).json()
  const again = await (await api(`/api/uploads/${id}/complete`, { method: 'POST' })).json()
  assert.deepEqual(again, first)
  assert.equal((await uploadStatus(id)).done, 'twice.mp4')
})

test('uploads survive a server restart', async () => {
  const id = await startUpload('restart.mp4', 6)
  await api(`/api/uploads/${id}?offset=0`, { method: 'PUT', body: 'abc' })
  const restarted = createUploadStore(root)
  assert.equal((await restarted.status(id, 'user-zane')).received, 3)
  await assert.rejects(restarted.status(id, 'user-jack'), { status: 404 })
  await assert.rejects(restarted.status('../../etc/passwd', 'user-zane'), { status: 404 })
  await restarted.appendChunk(id, 'user-zane', 3, Readable.from([Buffer.from('def')]))
  assert.equal((await restarted.complete(id, 'user-zane')).name, 'restart.mp4')
  assert.equal(await readFile(path.join(root, 'Seg B', 'restart.mp4'), 'utf8'), 'abcdef')
})
