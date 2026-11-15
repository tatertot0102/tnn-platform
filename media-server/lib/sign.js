import { createHmac, timingSafeEqual } from 'node:crypto'

// Short-lived signed URLs let <video>, <img> and download links work without
// an Authorization header, while still requiring a platform login to get one.
// A signature covers one relative path and one variant (orig/preview/thumb).

function signature(secret, relPath, variant, exp) {
  return createHmac('sha256', secret).update(`${relPath}\n${variant}\n${exp}`).digest('base64url')
}

export function signFile(secret, relPath, variant, ttlSeconds, now = Date.now()) {
  const exp = Math.floor(now / 1000) + ttlSeconds
  return { exp, sig: signature(secret, relPath, variant, exp) }
}

export function verifyFile(secret, relPath, variant, exp, sig, now = Date.now()) {
  const expNum = Number(exp)
  if (!Number.isInteger(expNum) || expNum < Math.floor(now / 1000)) return false
  if (typeof sig !== 'string' || !sig || typeof relPath !== 'string') return false
  const expected = Buffer.from(signature(secret, relPath, variant, expNum))
  const given = Buffer.from(sig)
  return expected.length === given.length && timingSafeEqual(expected, given)
}
