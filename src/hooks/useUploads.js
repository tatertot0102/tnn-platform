import { useSyncExternalStore } from 'react'
import { ACTIVE_STATES, getSnapshot, subscribe } from '../lib/uploadQueue'

/** The app-wide upload queue (see lib/uploadQueue). */
export const useUploadItems = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

/**
 * Totals for a list of upload items.
 * @param {Array<{ status: string, size: number, sent: number, speed?: number }>} items
 */
export function summarize(items) {
  const active = items.filter(i => ACTIVE_STATES.has(i.status))
  const counted = items.filter(i => i.status !== 'cancelled')
  const done = items.filter(i => i.status === 'done').length
  const failed = items.filter(i => i.status === 'error').length
  const totalBytes = counted.reduce((n, i) => n + i.size, 0)
  const sentBytes = counted.reduce((n, i) => n + (i.status === 'done' ? i.size : i.sent), 0)
  const speed = active.reduce((n, i) => n + (i.status === 'uploading' ? i.speed || 0 : 0), 0)
  const leftBytes = Math.max(0, totalBytes - sentBytes)
  return {
    total: counted.length, done, failed, active: active.length,
    isActive: active.length > 0,
    reconnecting: active.some(i => i.status === 'reconnecting' || i.status === 'offline'),
    totalBytes, sentBytes, leftBytes, speed,
    secondsLeft: speed > 0 ? leftBytes / speed : null,
    fraction: totalBytes ? sentBytes / totalBytes : 1,
  }
}
