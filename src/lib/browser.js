import { supabase } from './supabase'

// The remote browser runs on the Mac behind a sign-in gate. The platform proves
// who you are with your Supabase token and gets back a one-time link.
export const BROWSER_URL = (import.meta.env.VITE_BROWSER_URL || '').replace(/\/+$/, '')
export const isBrowserConfigured = Boolean(BROWSER_URL)

export class BrowserError extends Error {}

/**
 * Asks the gate for a one-time link into the remote browser.
 * @returns {Promise<string>} the URL to open
 */
export async function requestBrowserLink() {
  if (!isBrowserConfigured) throw new BrowserError('The remote browser isn’t set up yet.')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new BrowserError('Your session expired. Sign in again.')

  let res
  try {
    res = await fetch(`${BROWSER_URL}/session`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    throw new BrowserError('Can’t reach the browser. The Mac may be asleep or offline.')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.url) throw new BrowserError(body.error || `Browser error (${res.status})`)
  return body.url
}

/**
 * Runs a control action on the remote browser: status, restart, stop, start,
 * signout (ends every open browser session) or reset (wipes its profile and apps).
 * @returns {Promise<{running: boolean}>}
 */
export async function controlBrowser(action) {
  if (!isBrowserConfigured) throw new BrowserError('The remote browser isn’t set up yet.')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new BrowserError('Your session expired. Sign in again.')

  let res
  try {
    res = await fetch(`${BROWSER_URL}/control`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
  } catch {
    throw new BrowserError('Can’t reach the browser. The Mac may be asleep or offline.')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new BrowserError(body.error || `Browser error (${res.status})`)
  return body
}
