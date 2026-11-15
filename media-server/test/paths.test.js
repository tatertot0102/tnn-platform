import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { isSafeName, toFolderName, numberedName, resolveInside } from '../lib/paths.js'

test('isSafeName rejects traversal, separators, hidden and control characters', () => {
  for (const bad of ['', '.', '..', '../x', 'a/b', 'a\\b', '.hidden', 'a:b', 'nul\0', 'tab\t', ' pad', 'x'.repeat(201), null, 5]) {
    assert.equal(isSafeName(bad), false, `expected unsafe: ${JSON.stringify(bad)}`)
  }
  for (const ok of ['Wash Park Videos', 'PXL_2026.mp4', "Zane's cut (2).mov", 'é clip']) {
    assert.equal(isSafeName(ok), true, `expected safe: ${ok}`)
  }
})

test('toFolderName produces safe names from segment titles', () => {
  assert.equal(toFolderName('  Homecoming / Pep Rally: Day 1 '), 'Homecoming Pep Rally Day 1')
  assert.equal(toFolderName('...secret'), 'secret')
  assert.equal(toFolderName('////'), '')
  assert.ok(isSafeName(toFolderName('a'.repeat(300))))
})

test('numberedName inserts the counter before the extension', () => {
  assert.equal(numberedName('clip.mp4', 1), 'clip.mp4')
  assert.equal(numberedName('clip.mp4', 2), 'clip (2).mp4')
  assert.equal(numberedName('Folder', 3), 'Folder (3)')
})

test('resolveInside allows real entries and blocks symlinks and missing paths', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'media-root-'))
  const outside = await mkdtemp(path.join(tmpdir(), 'media-outside-'))
  await mkdir(path.join(root, 'Seg'))
  await writeFile(path.join(root, 'Seg', 'a.mp4'), 'x')
  await writeFile(path.join(outside, 'secret.txt'), 'x')
  await symlink(outside, path.join(root, 'Link'))
  await symlink(path.join(outside, 'secret.txt'), path.join(root, 'Seg', 'b.mp4'))

  assert.ok(await resolveInside(root, 'Seg', 'a.mp4'))
  assert.equal(await resolveInside(root, 'Link'), null)
  assert.equal(await resolveInside(root, 'Link', 'secret.txt'), null)
  assert.equal(await resolveInside(root, 'Seg', 'b.mp4'), null)
  assert.equal(await resolveInside(root, 'Seg', 'missing.mp4'), null)
  assert.equal(await resolveInside(root, '..', 'etc'), null)
})
