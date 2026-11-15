import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { File as FileIcon, Film, Folder, Image as ImageIcon, Loader2, Music, Play } from 'lucide-react'
import { formatBytes } from '../../lib/media'
import { StageBadge } from './DeliverableChip'

const KIND_LABEL = { video: 'Video', image: 'Image', audio: 'Audio', file: 'Document' }
const KIND_ICON = { video: Film, image: ImageIcon, audio: Music, file: FileIcon }
// Marked files get a tinted row and a coloured edge so they stand out.
const MARK_ROW = {
  final: 'bg-emerald-500/[0.08] hover:bg-emerald-500/15 shadow-[inset_3px_0_0_theme(colors.emerald.400)]',
  draft: 'bg-amber-500/[0.07] hover:bg-amber-500/15 shadow-[inset_3px_0_0_theme(colors.amber.400)]',
}
const MARK_TILE = {
  final: 'ring-1 ring-emerald-400/60 bg-emerald-500/[0.07]',
  draft: 'ring-1 ring-amber-400/50 bg-amber-500/[0.06]',
}

const isPreparing = item => item.kind === 'video' && ['missing', 'queued', 'working'].includes(item.preview)

function kindLabel(item) {
  if (item.isDir) return 'Folder'
  const ext = item.name.includes('.') ? item.name.split('.').pop().toUpperCase() : ''
  return ext ? `${KIND_LABEL[item.kind]} · ${ext}` : KIND_LABEL[item.kind]
}

// A ring that fills as a file uploads, shown in place of its thumbnail.
function UploadRing({ fraction, size }) {
  const r = size === 'sm' ? 11 : 18
  const c = 2 * Math.PI * r
  const box = (r + 3) * 2
  return (
    <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} className="-rotate-90" role="progressbar"
      aria-valuenow={Math.round(fraction * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Uploading">
      <circle cx={box / 2} cy={box / 2} r={r} fill="none" strokeWidth="3" className="stroke-gray-700" />
      <circle cx={box / 2} cy={box / 2} r={r} fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-brand-400 transition-[stroke-dashoffset] duration-normal"
        strokeDasharray={c} strokeDashoffset={c * (1 - fraction)} />
    </svg>
  )
}

function Thumb({ item, size = 'sm' }) {
  const [failed, setFailed] = useState(false)
  if (item.pending) return <UploadRing fraction={item.fraction} size={size} />
  const Icon = item.isDir ? Folder : KIND_ICON[item.kind] ?? FileIcon
  const iconColor = item.isDir ? 'text-sky-400' : 'text-gray-500'
  if (item.thumbUrl && !failed) {
    return <img src={item.thumbUrl} alt="" loading="lazy" onError={() => setFailed(true)}
      className={size === 'sm' ? 'h-7 w-7 rounded object-cover bg-gray-800' : 'absolute inset-0 h-full w-full object-cover'} />
  }
  return <Icon size={size === 'sm' ? 18 : 30} className={`${iconColor} ${item.isDir ? 'fill-sky-400/20' : ''}`} aria-hidden="true" />
}

/** Click selects, double-click (or tap on touch screens) opens. */
function useOpenGesture(onOpen, onSelect) {
  const coarse = useRef(typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches)
  return item => item.pending ? {} : ({
    onClick: e => (coarse.current && !e.metaKey && !e.shiftKey ? onOpen(item) : onSelect(item, e)),
    onDoubleClick: () => onOpen(item),
  })
}

/**
 * @typedef {{ key: string, name: string, isDir?: boolean, size?: number, modified: string, kind?: string, thumbUrl?: string, preview?: string }} Entry
 * @param {{ items: Entry[], selected: Set<string>, onSelect: (item: Entry, e: MouseEvent) => void, onToggle: (key: string) => void, onOpen: (item: Entry) => void, labels?: Record<string, {title: string}[]> }} props
 */
export function FileListView({ items, selected, onSelect, onToggle, onOpen, labels = {} }) {
  const gesture = useOpenGesture(onOpen, onSelect)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm select-none" role="grid" aria-multiselectable="true">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-800">
            <th className="w-9 py-2 pl-2"><span className="sr-only">Select</span></th>
            <th className="py-2 font-medium">Name</th>
            <th className="py-2 font-medium hidden md:table-cell w-44">Date modified</th>
            <th className="py-2 font-medium hidden sm:table-cell w-24 text-right pr-4">Size</th>
            <th className="py-2 font-medium hidden lg:table-cell w-36">Kind</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const isSel = selected.has(item.key)
            const linked = item.isDir ? labels[item.name] : null
            return (
              <tr key={item.key} {...gesture(item)} aria-selected={isSel}
                className={`cursor-default transition-colors duration-fast ${item.pending ? 'opacity-60' : ''} ${item.justAdded ? 'animate-fresh' : ''} ${isSel ? 'bg-brand-600/25 text-white' : item.mark ? MARK_ROW[item.mark] : i % 2 ? 'bg-gray-900/40 hover:bg-gray-800/60' : 'hover:bg-gray-800/60'}`}>
                <td className="py-1.5 pl-2" onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
                  {!item.pending && <input type="checkbox" checked={isSel} onChange={() => onToggle(item.key)} aria-label={`Select ${item.name}`}
                    className="h-4 w-4 rounded border-gray-600 bg-gray-800 accent-brand-600" />}
                </td>
                <td className="py-1.5 pr-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center"><Thumb item={item} /></span>
                    <span className={`truncate ${item.mark ? 'font-semibold text-white' : ''}`} title={item.name}>{item.name}</span>
                    {item.mark && <StageBadge stage={item.mark} />}
                    {linked && linked.map(seg => (
                      <span key={seg.id} className="badge bg-gray-800 text-gray-400 text-[10px] shrink-0 hidden sm:inline">{seg.title}</span>
                    ))}
                    {item.pending && <span className={`text-xs shrink-0 tabular-nums ${item.status === 'uploading' ? 'text-brand-400' : 'text-amber-300'}`}>{item.status === 'uploading' ? `Uploading ${Math.round(item.fraction * 100)}%` : 'Reconnecting…'}</span>}
                    {isPreparing(item) && <Loader2 size={12} className="animate-spin text-gray-500 shrink-0" aria-label="Preparing preview" />}
                  </div>
                </td>
                <td className="py-1.5 hidden md:table-cell text-gray-400 tabular-nums">{item.pending ? '—' : format(new Date(item.modified), 'MMM d, yyyy h:mm a')}</td>
                <td className="py-1.5 hidden sm:table-cell text-right pr-4 text-gray-400 tabular-nums">{item.isDir ? '—' : formatBytes(item.size)}</td>
                <td className="py-1.5 hidden lg:table-cell text-gray-500">{kindLabel(item)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function GridTile({ item, isSel, gestureProps, onToggle }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || visible) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  return (
    <li ref={ref} className="group relative">
      <div {...gestureProps} aria-selected={isSel} role="gridcell"
        className={`rounded-xl p-1.5 cursor-default transition-colors duration-fast ${item.pending ? 'opacity-60' : ''} ${item.justAdded ? 'animate-fresh' : ''} ${isSel ? 'bg-brand-600/25 ring-1 ring-brand-400/60' : item.mark ? MARK_TILE[item.mark] : 'hover:bg-gray-800/60'}`}>
        <div className="relative aspect-video overflow-hidden rounded-lg bg-gray-800/80 flex items-center justify-center">
          {visible && <Thumb item={item} size="lg" />}
          {item.kind === 'video' && !item.pending && (
            <span className="absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white">
              {isPreparing(item) ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Play size={12} className="ml-0.5" fill="currentColor" aria-hidden="true" />}
            </span>
          )}
        </div>
        {item.mark && <span className="absolute top-3 right-3"><StageBadge stage={item.mark} /></span>}
        <p className="mt-1.5 truncate text-sm text-gray-200 px-0.5" title={item.name}>{item.name}</p>
        <p className="text-xs text-gray-500 px-0.5">{item.isDir ? 'Folder' : item.pending ? `Uploading ${Math.round(item.fraction * 100)}%` : formatBytes(item.size)}</p>
      </div>
      {!item.pending && <input type="checkbox" checked={isSel} onChange={() => onToggle(item.key)} aria-label={`Select ${item.name}`}
        className={`absolute top-3 left-3 h-4 w-4 accent-brand-600 transition-opacity ${isSel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`} />}
    </li>
  )
}

/** Same props as FileListView. */
export function FileGridView({ items, selected, onSelect, onToggle, onOpen }) {
  const gesture = useOpenGesture(onOpen, onSelect)
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 select-none" role="grid" aria-multiselectable="true">
      {items.map(item => (
        <GridTile key={item.key} item={item} isSel={selected.has(item.key)} gestureProps={gesture(item)} onToggle={onToggle} />
      ))}
    </ul>
  )
}
