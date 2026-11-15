import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, File as FileIcon, Film, Image as ImageIcon, RotateCw, UploadCloud, WifiOff, X,
} from 'lucide-react'
import { useToast } from '../../context/ToastContext'
import { summarize, useUploadItems } from '../../hooks/useUploads'
import { useUploadGuards } from '../../hooks/useUploadGuards'
import { formatBytes } from '../../lib/media'
import { ACTIVE_STATES, cancel, cancelAll, clearFinished, getFile, retry, retryFailed } from '../../lib/uploadQueue'

const ROW_HEIGHT = 60
const LIST_HEIGHT = 300
const PHONE_LIST_HEIGHT = 3.5 * 60
const OVERSCAN = 4
const AUTO_COLLAPSE_MS = 4000
const isPhone = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
const listHeight = isPhone ? PHONE_LIST_HEIGHT : LIST_HEIGHT

const FILTERS = [
  ['all', 'All', () => true],
  ['active', 'In progress', i => ACTIVE_STATES.has(i.status)],
  ['failed', 'Failed', i => i.status === 'error'],
  ['done', 'Done', i => i.status === 'done'],
]

function formatDuration(seconds) {
  if (seconds === null || !Number.isFinite(seconds)) return ''
  if (seconds < 60) return 'under a minute'
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `~${mins} min`
  return `~${Math.floor(mins / 60)} h ${mins % 60} min`
}

// Image previews are made only while the row is on screen.
function RowThumb({ item }) {
  // Rows are keyed by upload id, so this runs once per row; the URL is
  // released as soon as the image has decoded.
  const [failed, setFailed] = useState(false)
  const [url] = useState(() => {
    const file = getFile(item.id)
    return file && item.type?.startsWith('image/') ? URL.createObjectURL(file) : null
  })
  const Icon = item.type?.startsWith('video/') ? Film : item.type?.startsWith('image/') ? ImageIcon : FileIcon
  return (
    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-800">
      {url && !failed ? <img src={url} alt="" onLoad={() => URL.revokeObjectURL(url)} onError={() => { URL.revokeObjectURL(url); setFailed(true) }} className="h-full w-full object-cover" /> : <Icon size={18} className="text-gray-500" aria-hidden="true" />}
    </span>
  )
}

function RetryCountdown({ at }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const secs = Math.max(0, Math.ceil((at - now) / 1000))
  return secs ? `retrying in ${secs}s` : 'retrying…'
}

function RowStatus({ item }) {
  const pct = item.size ? Math.floor((item.sent / item.size) * 100) : 0
  switch (item.status) {
    case 'queued': return <span className="text-gray-500">Waiting</span>
    case 'uploading': return <span className="text-gray-300 tabular-nums">{pct}%{item.speed ? ` · ${formatBytes(item.speed)}/s` : ''}</span>
    case 'reconnecting': return <span className="text-amber-300">Reconnecting · {item.retryAt ? <RetryCountdown at={item.retryAt} /> : 'retrying…'}</span>
    case 'offline': return <span className="text-amber-300">Offline · resumes when you reconnect</span>
    case 'done': return <span className="text-emerald-400">{item.savedAs && item.savedAs !== item.name ? `Saved as “${item.savedAs}”` : 'Uploaded'}</span>
    case 'cancelled': return <span className="text-gray-500">Cancelled</span>
    default: return <span className="text-red-400">{item.error || 'Failed'}</span>
  }
}

function UploadRow({ item, top }) {
  const isActive = ACTIVE_STATES.has(item.status)
  const pct = item.size ? item.sent / item.size : 0
  const canRetry = item.status === 'error' || item.status === 'cancelled'
  return (
    <li className="absolute inset-x-0 flex items-center gap-3 px-3" style={{ top, height: ROW_HEIGHT }}>
      <RowThumb item={item} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-gray-100" title={item.name}>{item.name}</p>
        <p className="truncate text-xs" title={item.error}>
          <RowStatus item={item} />
          <span className="text-gray-600"> · {item.folder.split('/').join(' / ')}</span>
        </p>
        {isActive && (
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-800" role="progressbar" aria-label={`${item.name} progress`}
            aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full origin-left transition-transform duration-normal ease-out-expo ${item.status === 'uploading' ? 'bg-brand-400' : 'bg-amber-400/70'}`}
              style={{ transform: `scaleX(${pct})` }} />
          </div>
        )}
      </div>
      {item.status === 'done' && <CheckCircle2 size={18} className="shrink-0 text-emerald-400" aria-hidden="true" />}
      {canRetry && (
        <button type="button" onClick={() => retry(item.id)} aria-label={`Retry ${item.name}`}
          className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
          <RotateCw size={15} aria-hidden="true" />
        </button>
      )}
      {isActive && (
        <button type="button" onClick={() => cancel(item.id)} aria-label={`Cancel ${item.name}`}
          className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-800 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
          <X size={15} aria-hidden="true" />
        </button>
      )}
    </li>
  )
}

// Renders only the rows in view, so a 1,000-file batch scrolls smoothly.
function WindowedList({ items }) {
  const [scrollTop, setScrollTop] = useState(0)
  const height = Math.min(listHeight, items.length * ROW_HEIGHT)
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const last = Math.min(items.length, Math.ceil((scrollTop + height) / ROW_HEIGHT) + OVERSCAN)
  if (!items.length) return <p className="px-3 py-6 text-center text-sm text-gray-500">Nothing here.</p>
  return (
    <div className="overflow-y-auto overscroll-contain" style={{ height }} onScroll={e => setScrollTop(e.currentTarget.scrollTop)}>
      <ul className="relative" style={{ height: items.length * ROW_HEIGHT }}>
        {items.slice(first, last).map((item, i) => <UploadRow key={item.id} item={item} top={(first + i) * ROW_HEIGHT} />)}
      </ul>
    </div>
  )
}

function headline(s) {
  if (s.isActive) {
    const left = [formatBytes(s.leftBytes) + ' left', formatDuration(s.secondsLeft)].filter(Boolean).join(' · ')
    return { title: `${s.done} of ${s.total} uploaded`, detail: s.reconnecting ? 'Reconnecting… uploads resume on their own' : left }
  }
  if (s.failed) return { title: `${s.failed} upload${s.failed === 1 ? '' : 's'} failed`, detail: `${s.done} of ${s.total} uploaded` }
  return { title: `${s.done === 1 ? '1 file' : `All ${s.done} files`} uploaded`, detail: formatBytes(s.totalBytes) }
}

/** The app-wide upload panel: a pill when collapsed, a list when open. */
export default function UploadDock() {
  const toast = useToast()
  const items = useUploadItems()
  const summary = summarize(items)
  const [filter, setFilter] = useState('all')
  // Phones start as a slim bar so the folder stays visible; desktop opens.
  const [open, setOpen] = useState(!isPhone)
  const ref = useRef(null)
  const visible = items.length > 0

  useUploadGuards(summary, s => {
    const folders = [...new Set(items.filter(i => i.status === 'done').map(i => i.folder.split('/').at(-1)))]
    if (s.failed) toast.error(`${s.failed} of ${s.total} uploads failed. Open the upload panel to retry.`)
    else if (s.done) toast.success(`${s.done} file${s.done === 1 ? '' : 's'} uploaded${folders.length === 1 ? ` to ${folders[0]}` : ''}`)
    if (isPhone) navigator.vibrate?.(s.failed ? [80, 60, 80] : 60)
  })

  // Collapse to the pill a moment after everything finishes cleanly.
  useEffect(() => {
    if (summary.isActive || summary.failed || !visible) return undefined
    const id = setTimeout(() => setOpen(false), AUTO_COLLAPSE_MS)
    return () => clearTimeout(id)
  }, [summary.isActive, summary.failed, visible])

  // A new batch opens the panel on desktop; failures open it everywhere.
  const [seen, setSeen] = useState({ isActive: summary.isActive, failed: summary.failed })
  if (seen.isActive !== summary.isActive || seen.failed !== summary.failed) {
    setSeen({ isActive: summary.isActive, failed: summary.failed })
    if (summary.isActive && !seen.isActive && !isPhone) setOpen(true)
    if (summary.failed > seen.failed) { setOpen(true); setFilter('failed') }
  }

  // Lets page content (the phone upload button) sit above the dock.
  useLayoutEffect(() => {
    const el = ref.current
    const root = document.documentElement
    if (!el) { root.style.setProperty('--upload-dock-h', '0px'); return undefined }
    const ro = new ResizeObserver(() => root.style.setProperty('--upload-dock-h', `${el.offsetHeight}px`))
    root.dataset.uploadDockOpen = String(open)
    ro.observe(el)
    return () => { ro.disconnect(); root.style.setProperty('--upload-dock-h', '0px'); delete root.dataset.uploadDockOpen }
  }, [visible, open])

  if (!visible) return null
  const { title, detail } = headline(summary)
  const shown = items.filter(FILTERS.find(([key]) => key === filter)[2])
  const StatusIcon = summary.isActive ? (summary.reconnecting ? WifiOff : UploadCloud) : summary.failed ? AlertTriangle : CheckCircle2
  const iconColor = summary.isActive ? (summary.reconnecting ? 'text-amber-300' : 'text-brand-400') : summary.failed ? 'text-red-400' : 'text-emerald-400'

  return (
    <section ref={ref} aria-label="Uploads" onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
      className="fixed z-[60] inset-x-0 bottom-0 md:inset-x-auto md:right-6 md:bottom-6 md:w-[400px] animate-sheet-in md:animate-pop-in
        rounded-t-2xl md:rounded-2xl border border-gray-800 bg-gray-900/95 shadow-2xl shadow-black/50 backdrop-blur-md
        pb-[env(safe-area-inset-bottom)] md:pb-0 overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="relative flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400">
        <StatusIcon size={20} className={`shrink-0 ${iconColor} ${summary.isActive && !summary.reconnecting ? 'motion-safe:animate-pulse' : ''}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-gray-100">{title}</span>
          <span className="block truncate text-xs text-gray-400" aria-live="polite">{detail}</span>
        </span>
        {open ? <ChevronDown size={18} className="text-gray-500" aria-hidden="true" /> : <ChevronUp size={18} className="text-gray-500" aria-hidden="true" />}
        {summary.isActive && (
          <span className="absolute inset-x-0 bottom-0 h-0.5 bg-gray-800" role="progressbar" aria-label="Overall upload progress"
            aria-valuenow={Math.round(summary.fraction * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span className="block h-full origin-left bg-brand-400 transition-transform duration-normal ease-out-expo" style={{ transform: `scaleX(${summary.fraction})` }} />
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-gray-800">
          {summary.isActive && isPhone && (
            <p className="bg-brand-600/10 px-4 py-2 text-xs text-brand-200">Keep this screen open until uploads finish.</p>
          )}
          <div className="flex items-center gap-1 overflow-x-auto px-3 py-2" role="tablist" aria-label="Filter uploads">
            {FILTERS.map(([key, label, test]) => {
              const count = items.filter(test).length
              return (
                <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => setFilter(key)}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs transition-colors duration-fast ${filter === key ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}
                    ${key === 'failed' && count ? 'text-red-300' : ''}`}>
                  {label} <span className="tabular-nums opacity-70">{count}</span>
                </button>
              )
            })}
          </div>
          <WindowedList items={shown} />
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-800 px-3 py-2">
            {summary.failed > 0 && (
              <button type="button" onClick={retryFailed} className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs">
                <RotateCw size={13} aria-hidden="true" /> Retry failed
              </button>
            )}
            {summary.isActive
              ? <button type="button" onClick={() => { if (confirm('Cancel all uploads that haven’t finished?')) cancelAll() }} className="btn-ghost px-3 py-1.5 text-xs hover:text-red-300">Cancel all</button>
              : <button type="button" onClick={clearFinished} className="btn-ghost px-3 py-1.5 text-xs">Clear list</button>}
          </div>
        </div>
      )}
    </section>
  )
}
