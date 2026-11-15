import { useEffect, useRef } from 'react'

const BASE_TITLE_KEY = '__tnnBaseTitle'

/**
 * Keeps uploads alive and visible while they run: holds a screen wake lock so
 * phones don't sleep mid-upload, warns before the tab is closed, and shows
 * progress in the tab title. Calls onFinish(summary) when a batch ends.
 * @param {{ isActive: boolean, done: number, total: number, failed: number }} summary
 * @param {(summary: object) => void} onFinish
 */
export function useUploadGuards(summary, onFinish) {
  const { isActive, done, total } = summary
  const wasActive = useRef(false)
  const latest = useRef(summary)
  const finish = useRef(onFinish)
  useEffect(() => { latest.current = summary; finish.current = onFinish })

  // Screen wake lock, re-requested when the tab becomes visible again (the
  // browser releases it whenever the page is hidden).
  useEffect(() => {
    if (!isActive || !('wakeLock' in navigator)) return undefined
    let lock = null
    let stopped = false
    const request = async () => {
      if (stopped || document.visibilityState !== 'visible' || lock) return
      try {
        lock = await navigator.wakeLock.request('screen')
        lock.addEventListener('release', () => { lock = null })
      } catch { /* not allowed right now (low battery, no gesture yet) */ }
    }
    request()
    document.addEventListener('visibilitychange', request)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', request)
      lock?.release().catch(() => {})
    }
  }, [isActive])

  // Warn before closing or reloading the tab mid-upload.
  useEffect(() => {
    if (!isActive) return undefined
    const warn = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isActive])

  // "(3/10) Uploading…" in the tab title.
  useEffect(() => {
    if (!isActive) return
    if (!window[BASE_TITLE_KEY]) window[BASE_TITLE_KEY] = document.title
    document.title = `(${done}/${total}) Uploading… – ${window[BASE_TITLE_KEY]}`
  }, [isActive, done, total])

  useEffect(() => {
    if (isActive) { wasActive.current = true; return }
    if (window[BASE_TITLE_KEY]) { document.title = window[BASE_TITLE_KEY]; window[BASE_TITLE_KEY] = null }
    if (!wasActive.current) return
    wasActive.current = false
    finish.current?.(latest.current)
  }, [isActive])
}
