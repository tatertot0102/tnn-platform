import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signFile, verifyFile } from '../lib/sign.js'

const SECRET = 'test-secret'
const NOW = 1_800_000_000_000

test('a signed URL verifies for the same path and variant before it expires', () => {
  const { exp, sig } = signFile(SECRET, 'Seg/a.mp4', 'orig', 60, NOW)
  assert.equal(verifyFile(SECRET, 'Seg/a.mp4', 'orig', exp, sig, NOW), true)
})

test('a signature does not transfer to another path, variant or secret', () => {
  const { exp, sig } = signFile(SECRET, 'Seg/a.mp4', 'thumb', 60, NOW)
  assert.equal(verifyFile(SECRET, 'Seg/b.mp4', 'thumb', exp, sig, NOW), false)
  assert.equal(verifyFile(SECRET, 'Seg/a.mp4', 'orig', exp, sig, NOW), false)
  assert.equal(verifyFile('other-secret', 'Seg/a.mp4', 'thumb', exp, sig, NOW), false)
})

test('expired, tampered or missing signatures are rejected', () => {
  const { exp, sig } = signFile(SECRET, 'Seg/a.mp4', 'orig', 60, NOW)
  assert.equal(verifyFile(SECRET, 'Seg/a.mp4', 'orig', exp, sig, NOW + 61_000), false)
  assert.equal(verifyFile(SECRET, 'Seg/a.mp4', 'orig', exp + 1000, sig, NOW), false)
  assert.equal(verifyFile(SECRET, 'Seg/a.mp4', 'orig', exp, '', NOW), false)
  assert.equal(verifyFile(SECRET, 'Seg/a.mp4', 'orig', 'abc', sig, NOW), false)
  assert.equal(verifyFile(SECRET, null, 'orig', exp, sig, NOW), false)
})
