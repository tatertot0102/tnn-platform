import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronRight, CircleDashed, Download, FolderPlus, FolderUp, LayoutGrid, List, Pencil, RefreshCw, Star, Trash2, Upload, UploadCloud, X,
} from 'lucide-react'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'
import { useToast } from '../../context/ToastContext'
import { useFileSelection } from '../../hooks/useFileSelection'
import { useUploadItems } from '../../hooks/useUploads'
import { readDroppedTree, treeFromInput } from '../../lib/dropFiles'
import { createFolder, downloadAll, joinPath, renameItem, trashItems } from '../../lib/media'
import { ACTIVE_STATES, addFiles, addTree } from '../../lib/uploadQueue'
import { FileGridView, FileListView } from './FileViews'
import PlayerModal from './PlayerModal'

const VIEW_KEY = 'tnn.media.view'
const POLL_MS = 4000
const ACCEPT_ANY = 'image/*,video/*,*/*'
const kindOfType = (type = '') => ['video', 'image', 'audio'].find(k => type.startsWith(`${k}/`)) ?? 'file'
const busyPreview = f => ['missing', 'queued', 'working'].includes(f.preview) || ['missing', 'queued', 'working'].includes(f.thumb)

function readView() {
  try { return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list' } catch { return 'list' }
}

function NameDialog({ dialog, onClose, onSubmit }) {
  const [value, setValue] = useState(dialog?.initial ?? '')
  if (!dialog) return null
  return (
    <Modal open onClose={onClose} title={dialog.title} size="sm">
      <form onSubmit={e => { e.preventDefault(); if (value.trim()) onSubmit(value.trim()) }} className="space-y-4">
        <input className="input" autoFocus value={value} onChange={e => setValue(e.target.value)} maxLength={200}
          onFocus={e => { const dot = e.target.value.lastIndexOf('.'); e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length) }} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button type="submit" className="btn-primary text-sm">{dialog.action}</button>
        </div>
      </form>
    </Modal>
  )
}

// Asks what to do when picked files already exist in the folder.
function DuplicateDialog({ pending, onKeepBoth, onSkip, onClose }) {
  if (!pending) return null
  const n = pending.dupes.length
  const fresh = pending.files.length - n
  return (
    <Modal open onClose={onClose} title={n === 1 ? 'This file is already here' : `${n} files are already here`} size="sm">
      <div className="space-y-4">
        <ul className="max-h-40 overflow-y-auto rounded-lg border border-gray-800 divide-y divide-gray-800 text-sm">
          {pending.dupes.slice(0, 50).map(f => <li key={f.name} className="truncate px-3 py-1.5 text-gray-300">{f.name}</li>)}
          {n > 50 && <li className="px-3 py-1.5 text-gray-500">and {n - 50} more</li>}
        </ul>
        <p className="text-sm text-gray-400">Keeping both saves the new copy with a number, like “clip (2).mp4”. Nothing is ever overwritten.</p>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" onClick={onSkip} className="btn-ghost border border-gray-700 text-sm">
            {fresh ? `Skip them, upload ${fresh} other${fresh === 1 ? '' : 's'}` : 'Skip them'}
          </button>
          <button type="button" onClick={onKeepBoth} className="btn-primary text-sm">Keep both</button>
        </div>
      </div>
    </Modal>
  )
}

function ToolButton({ icon, label, onClick, disabled, danger, primary, showLabel = true }) {
  const Icon = icon
  const base = primary ? 'btn-primary' : `btn-ghost border border-gray-700 ${danger ? 'text-red-400 hover:text-red-300' : ''}`
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label}
      className={`${base} flex items-center gap-1.5 text-xs px-2.5 py-1.5 disabled:opacity-40`}>
      <Icon size={14} aria-hidden="true" />{showLabel && <span className="hidden sm:inline">{label}</span>}
    </button>
  )
}

/**
 * A Finder-style browser for a folder on the media server.
 * @param {{
 *   source: { key: string, list: (sub: string) => Promise<{ folders: object[], files: object[] }>, full?: (sub: string) => string },
 *   rootLabel: string, readOnly?: boolean, canDelete?: boolean, canRenameTop?: boolean,
 *   labels?: Record<string, {id: string, title: string}[]>, actions?: React.ReactNode,
 *   onRenamed?: (fromFull: string, toFull: string) => Promise<void> | void,
 *   marks?: Record<string, 'draft'|'final'>, onMark?: (fullPaths: string[], stage: 'draft'|'final'|null) => Promise<void>,
 * }} props
 */
export default function FileBrowser({ source, rootLabel, readOnly = false, canDelete = false, canRenameTop = false, labels, actions, onRenamed, marks, onMark }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const inputRef = useRef(null)
  const folderInputRef = useRef(null)
  const [pendingAdd, setPendingAdd] = useState(null)
  const [sub, setSub] = useState('')
  const [view, setView] = useState(readView)
  const [playing, setPlaying] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [dragging, setDragging] = useState(false)

  const queryKey = ['media', 'browse', source.key, sub]
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey, queryFn: () => source.list(sub),
    refetchInterval: q => (q.state.data?.files?.some(busyPreview) ? POLL_MS : false),
  })

  const uploadFolder = source.full ? source.full(sub) : ''
  const allUploads = useUploadItems()
  const uploadsHere = useMemo(() => allUploads.filter(u => u.folder === uploadFolder), [allUploads, uploadFolder])

  // Finals first, then drafts, then folders and everything else (each group
  // keeps the server's name order).
  const items = useMemo(() => {
    // Files in flight get a placeholder row; ones still waiting are just counted.
    const uploading = uploadsHere.filter(u => ACTIVE_STATES.has(u.status) && u.status !== 'queued')
    const freshNames = new Set(uploadsHere.filter(u => u.status === 'done' && u.fresh).map(u => u.savedAs))
    const files = (data?.files ?? []).map(f => ({ ...f, key: `f:${f.name}`, mark: marks?.[source.full?.(joinPath(sub, f.name))], justAdded: freshNames.has(f.name) }))
    const pending = uploading.map(u => ({ key: `u:${u.id}`, name: u.name, size: u.size, kind: kindOfType(u.type), pending: true, status: u.status, fraction: u.size ? u.sent / u.size : 0, modified: new Date(u.addedAt).toISOString() }))
    return [
      ...pending,
      ...files.filter(f => f.mark === 'final'),
      ...files.filter(f => f.mark === 'draft'),
      ...(data?.folders ?? []).map(f => ({ ...f, isDir: true, key: `d:${f.name}` })),
      ...files.filter(f => !f.mark),
    ]
  }, [data, marks, source, sub, uploadsHere])
  const waitingHere = uploadsHere.filter(u => u.status === 'queued').length
  const keys = useMemo(() => items.filter(i => !i.pending).map(i => i.key), [items])
  const selection = useFileSelection(keys)
  const chosen = items.filter(i => selection.selected.has(i.key))
  const chosenFiles = chosen.filter(i => !i.isDir)

  const full = name => source.full?.(joinPath(sub, name))
  const atTop = sub === ''
  const canUpload = !readOnly && Boolean(uploadFolder)
  const canRename = !readOnly && chosen.length === 1 && (!atTop || canRenameTop)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['media', 'browse', source.key] })
  const folderLabel = uploadFolder.split('/').at(-1) || rootLabel

  function queue(files) {
    const { added, skipped } = addFiles(files, uploadFolder)
    if (skipped) toast.info(`Skipped ${skipped} empty file${skipped === 1 ? '' : 's'}`)
    return added
  }

  // Picked or dropped files: ask first if some names are already taken.
  function pickFiles(fileList) {
    const files = Array.from(fileList ?? [])
    if (!canUpload || !files.length) return
    const taken = new Set([...(data?.files ?? []).map(f => f.name), ...uploadsHere.filter(u => ACTIVE_STATES.has(u.status)).map(u => u.name)])
    const dupes = files.filter(f => taken.has(f.name))
    if (dupes.length) setPendingAdd({ files, dupes })
    else queue(files)
  }

  async function pickTree(entries) {
    if (!canUpload || !entries.length) return
    try {
      const { skipped } = await addTree(entries, uploadFolder)
      if (skipped) toast.info(`Skipped ${skipped} empty file${skipped === 1 ? '' : 's'}`)
    } catch (err) {
      toast.error(`Couldn’t create the folders: ${err.message}`)
    }
  }

  function go(next) { setSub(next); selection.clear() }
  function open(item) {
    if (item.isDir) go(joinPath(sub, item.name))
    else setPlaying(item)
  }

  async function run(action, message) {
    try {
      await action()
      if (message) toast.success(message)
      refresh()
    } catch (err) {
      toast.error(err.message)
    }
  }

  function submitDialog(name) {
    const current = dialog
    setDialog(null)
    if (current.type === 'folder') {
      return run(() => createFolder(name, uploadFolder), 'Folder created')
    }
    const item = current.item
    return run(async () => {
      const from = full(item.name)
      const to = await renameItem(from, name)
      await onRenamed?.(from, to)
      selection.clear()
    }, 'Renamed')
  }

  function remove() {
    const names = chosen.map(i => i.name)
    const what = names.length === 1 ? `“${names[0]}”` : `${names.length} items`
    if (!confirm(`Delete ${what}? They’ll be moved to the media server’s trash and can be recovered by Zane.`)) return
    run(async () => { await trashItems(names.map(full)); selection.clear() }, `Deleted ${what}`)
  }

  function onKeyDown(e) {
    if (e.target.closest('input, textarea, select')) return
    if ((e.metaKey || e.ctrlKey) && e.key === 'a') { e.preventDefault(); selection.selectAll() }
    else if (e.key === 'Escape') selection.clear()
    else if (e.key === 'Enter' && chosen.length === 1) open(chosen[0])
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    if (!canUpload) return
    const tree = readDroppedTree(e.dataTransfer)
    if (tree) tree.then(pickTree, err => toast.error(`Couldn’t read that folder: ${err.message}`))
    else pickFiles(e.dataTransfer.files)
  }

  const crumbs = sub ? sub.split('/') : []
  const compressedReady = chosenFiles.filter(f => f.previewDownloadUrl)

  return (
    <div className="space-y-3" onKeyDown={onKeyDown}
      onDragOver={e => { if (canUpload) { e.preventDefault(); setDragging(true) } }}
      onDragLeave={e => e.currentTarget.contains(e.relatedTarget) || setDragging(false)} onDrop={onDrop}>

      {/* Path bar + view controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Folder path" className="flex items-center gap-1 min-w-0 text-sm">
          <button type="button" onClick={() => go('')} className={`truncate hover:text-white ${crumbs.length ? 'text-gray-400' : 'text-gray-100 font-medium'}`}>{rootLabel}</button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1 min-w-0">
              <ChevronRight size={14} className="text-gray-600 shrink-0" aria-hidden="true" />
              <button type="button" onClick={() => go(crumbs.slice(0, i + 1).join('/'))}
                className={`truncate hover:text-white ${i === crumbs.length - 1 ? 'text-gray-100 font-medium' : 'text-gray-400'}`}>{c}</button>
            </span>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          {actions}
          <ToolButton icon={RefreshCw} label="Refresh" showLabel={false} onClick={() => refetch()} disabled={isFetching} />
          <div className="flex rounded-lg border border-gray-700 p-0.5" role="group" aria-label="View">
            {[['list', List], ['grid', LayoutGrid]].map(([v, iconComponent]) => {
              const ViewIcon = iconComponent
              return (
              <button key={v} type="button" aria-pressed={view === v} aria-label={`${v} view`}
                onClick={() => { setView(v); try { localStorage.setItem(VIEW_KEY, v) } catch { /* private mode */ } }}
                className={`p-1.5 rounded-md transition-colors duration-fast ${view === v ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                <ViewIcon size={14} aria-hidden="true" />
              </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Actions: selection-aware, like Finder's toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 min-h-8">
        {chosen.length > 0 ? (
          <>
            <span className="text-xs text-gray-400 mr-1">{chosen.length} selected</span>
            <ToolButton icon={Download} label={`Download${chosenFiles.length > 1 ? ` (${chosenFiles.length})` : ''}`} disabled={!chosenFiles.length}
              onClick={() => downloadAll(chosenFiles.map(f => f.downloadUrl))} />
            <ToolButton icon={Download} label={`Compressed${compressedReady.length ? ` (${compressedReady.length})` : ''}`} disabled={!compressedReady.length}
              onClick={() => downloadAll(compressedReady.map(f => f.previewDownloadUrl))} />
            {onMark && chosenFiles.length > 0 && (
              <>
                <ToolButton icon={CircleDashed} label="Mark draft" onClick={() => run(() => onMark(chosenFiles.map(f => full(f.name)), 'draft'), 'Marked as draft')} />
                <ToolButton icon={Star} label="Mark final" onClick={() => run(() => onMark(chosenFiles.map(f => full(f.name)), 'final'), 'Marked as final')} />
                {chosenFiles.some(f => f.mark) && <ToolButton icon={X} label="Unmark" onClick={() => run(() => onMark(chosenFiles.filter(f => f.mark).map(f => full(f.name)), null), 'Unmarked')} />}
              </>
            )}
            {canRename && <ToolButton icon={Pencil} label="Rename" onClick={() => setDialog({ type: 'rename', item: chosen[0], title: 'Rename', action: 'Rename', initial: chosen[0].name })} />}
            {canDelete && !readOnly && <ToolButton icon={Trash2} label="Delete" danger onClick={remove} />}
            <ToolButton icon={X} label="Clear" showLabel={false} onClick={selection.clear} />
          </>
        ) : (
          <>
            {canUpload && <ToolButton icon={Upload} label="Upload files" primary onClick={() => inputRef.current?.click()} />}
            {canUpload && <span className="hidden md:inline-flex"><ToolButton icon={FolderUp} label="Upload folder" onClick={() => folderInputRef.current?.click()} /></span>}
            {!readOnly && (canUpload || (atTop && canRenameTop)) && (
              <ToolButton icon={FolderPlus} label="New folder" onClick={() => setDialog({ type: 'folder', title: 'New folder', action: 'Create', initial: '' })} />
            )}
            <span className="text-xs text-gray-500 ml-1 hidden md:inline">
              {items.length ? 'Click to select · ⌘/Shift-click for more · double-click to open' : ''}
            </span>
          </>
        )}
        <input ref={inputRef} type="file" multiple accept={ACCEPT_ANY} hidden onChange={e => { pickFiles(e.target.files); e.target.value = '' }} />
        <input ref={folderInputRef} type="file" multiple webkitdirectory="" hidden onChange={e => { pickTree(treeFromInput(e.target.files)); e.target.value = '' }} />
      </div>

      {waitingHere > 0 && (
        <p className="text-xs text-gray-500" aria-live="polite">{waitingHere} more file{waitingHere === 1 ? '' : 's'} waiting to upload here</p>
      )}
      <div className="card relative overflow-hidden" tabIndex={-1}>
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] border-2 border-dashed border-brand-400 bg-gray-950/85 backdrop-blur-sm animate-fade-in">
            {/* Pinned mid-screen so it's visible in a long folder too. */}
            <div className="sticky top-[35vh] flex flex-col items-center gap-2 py-12 text-center">
              <UploadCloud size={32} className="text-brand-400" aria-hidden="true" />
              <p className="text-base font-semibold text-white">Drop to upload</p>
              <p className="text-sm text-gray-400">into <span className="text-gray-200">{uploadFolder.split('/').join(' / ')}</span> · files or whole folders</p>
            </div>
          </div>
        )}
        <div className={view === 'grid' ? 'p-3' : ''}>
          {isLoading && <div className="py-12 flex justify-center"><Spinner size={6} /></div>}
          {error && (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-300">Couldn’t load this folder</p>
              <p className="mt-1 text-xs text-gray-500">{error.message}</p>
              <button type="button" onClick={() => refetch()} className="mt-3 btn-ghost border border-gray-700 text-xs px-3 py-1.5">Try again</button>
            </div>
          )}
          {!isLoading && !error && !items.length && (canUpload ? (
            <button type="button" onClick={() => inputRef.current?.click()}
              className="m-3 flex w-[calc(100%-1.5rem)] flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-700 px-4 py-12 text-center transition-colors duration-fast hover:border-brand-400 hover:bg-brand-400/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
              <UploadCloud size={30} className="text-gray-500" aria-hidden="true" />
              <span className="text-sm font-medium text-gray-200">This folder is empty</span>
              <span className="text-xs text-gray-500"><span className="hidden md:inline">Drag files or folders here, or </span>tap to choose files. Select as many as you like.</span>
            </button>
          ) : <p className="py-12 text-center text-sm text-gray-500">Nothing here yet.</p>)}
          {!isLoading && !error && items.length > 0 && (
            view === 'grid'
              ? <FileGridView items={items} selected={selection.selected} onSelect={(item, e) => selection.click(item.key, e)} onToggle={selection.toggle} onOpen={open} />
              : <FileListView items={items} selected={selection.selected} onSelect={(item, e) => selection.click(item.key, e)}
                onToggle={selection.toggle} onOpen={open} labels={atTop ? labels : undefined} />
          )}
        </div>
      </div>

      {canUpload && (
        <div className="md:hidden sticky z-30 pt-2 [html[data-upload-dock-open=true]_&]:hidden" style={{ bottom: 'calc(var(--upload-dock-h, 0px) + max(0.75rem, env(safe-area-inset-bottom)))' }}>
          <button type="button" onClick={() => inputRef.current?.click()}
            className="btn-primary flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-base shadow-lg shadow-black/40">
            <Upload size={18} aria-hidden="true" />
            <span className="truncate">Upload to {folderLabel}</span>
          </button>
        </div>
      )}

      <DuplicateDialog pending={pendingAdd} onClose={() => setPendingAdd(null)}
        onKeepBoth={() => { queue(pendingAdd.files); setPendingAdd(null) }}
        onSkip={() => { const dupes = new Set(pendingAdd.dupes); queue(pendingAdd.files.filter(f => !dupes.has(f))); setPendingAdd(null) }} />
      <PlayerModal key={playing?.key} file={playing} onClose={() => setPlaying(null)} />
      <NameDialog key={dialog ? `${dialog.type}:${dialog.initial}` : 'none'} dialog={dialog} onClose={() => setDialog(null)} onSubmit={submitDialog} />
    </div>
  )
}
