// GitHub Pages caches index.html for 10 minutes and open tabs keep running
// the old bundle, so new deploys don't show up. This compares the entry
// bundle this tab loaded with the one currently published and reloads when
// they differ — only when the user comes back to the tab, so nothing is
// interrupted mid-edit.

const CHECK_INTERVAL_MS = 5 * 60 * 1000
const ENTRY_SCRIPT_PATTERN = /assets\/index-[\w-]+\.js/

function currentEntry() {
  const script = document.querySelector('script[type="module"][src*="assets/index-"]')
  return script?.getAttribute('src')?.match(ENTRY_SCRIPT_PATTERN)?.[0] ?? null
}

async function publishedEntry() {
  const res = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`index.html fetch failed: ${res.status}`)
  return (await res.text()).match(ENTRY_SCRIPT_PATTERN)?.[0] ?? null
}

export function startAutoUpdate() {
  const loaded = currentEntry()
  if (!loaded) return // dev server: no hashed bundle to compare

  let hasUpdate = false

  const check = async () => {
    try {
      const latest = await publishedEntry()
      if (latest && latest !== loaded) hasUpdate = true
    } catch (err) {
      console.warn('[autoUpdate] version check failed', err)
    }
  }

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return
    if (!hasUpdate) await check()
    if (hasUpdate) window.location.reload()
  })

  setInterval(check, CHECK_INTERVAL_MS)
}
