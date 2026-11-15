import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Star, Upload, X } from 'lucide-react'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'
import { useToast } from '../../context/ToastContext'
import { createSegmentFolder, formatBytes, getSegmentFolder, isMediaConfigured, joinPath, listPath } from '../../lib/media'
import { STAGES, markDeliverable, uploadDeliverable } from '../../lib/deliverables'
import DeliverableChip from './DeliverableChip'

function StagePicker({ stage, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Draft or final">
      {Object.entries(STAGES).map(([key, s]) => (
        <button key={key} type="button" role="radio" aria-checked={stage === key} onClick={() => onChange(key)}
          className={`rounded-xl border px-3 py-2.5 text-left transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${stage === key ? s.chip : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
          <span className="flex items-center gap-1.5 text-sm font-semibold">{key === 'final' && <Star size={13} fill="currentColor" aria-hidden="true" />}{s.label}</span>
          <span className="block text-xs opacity-75">{key === 'final' ? 'The finished cut' : 'Work in progress for review'}</span>
        </button>
      ))}
    </div>
  )
}

// Files in the segment folder plus its Drafts/ and Final/ subfolders.
async function listCandidates(folder) {
  const places = ['', STAGES.draft.folder, STAGES.final.folder]
  const results = await Promise.allSettled(places.map(sub => listPath(joinPath(folder, sub))))
  return results.flatMap((r, i) => (r.status === 'fulfilled'
    ? r.value.files.map(f => ({ ...f, path: joinPath(folder, places[i], f.name), where: places[i] }))
    : []))
}

/**
 * Attach a draft or final to a subtask or approval gate: upload a new file,
 * pick one already in the segment's folder, or (subtasks) paste a link.
 * @param {{ segment: { id: string, title: string }, target: { type: 'subtask'|'gate', id: string, title: string, submit_url?: string },
 *   attached: object[], onClose: () => void, onChanged: () => void, onSaveLink?: (id: string, url: string|null) => void }} props
 */
export default function SubmitDeliverableModal({ segment, target, attached, onClose, onChanged, onSaveLink }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const inputRef = useRef(null)
  const [tab, setTab] = useState('upload')
  const [stage, setStage] = useState('draft')
  const [file, setFile] = useState(null)
  const [picked, setPicked] = useState('')
  const [url, setUrl] = useState(target.submit_url ?? '')
  const [sent, setSent] = useState(null)
  const [busy, setBusy] = useState(false)

  const folderKey = ['segment', segment.id, 'mediaFolder']
  const { data: folder, isLoading: folderLoading } = useQuery({ queryKey: folderKey, queryFn: () => getSegmentFolder(segment.id), enabled: isMediaConfigured })
  const { data: candidates = [], isLoading: listLoading } = useQuery({
    queryKey: ['media', 'candidates', folder], queryFn: () => listCandidates(folder), enabled: Boolean(folder) && tab === 'pick',
  })
  const link = target.type === 'subtask' ? { subtaskId: target.id } : { gateId: target.id }
  const tabs = [['upload', 'Upload'], ['pick', 'From folder'], ...(onSaveLink ? [['link', 'Link']] : [])]

  async function run(action, message) {
    setBusy(true)
    try {
      await action()
      toast.success(message)
      onChanged()
      onClose()
    } catch (err) {
      toast.error(err.message)
      setBusy(false)
    }
  }

  const upload = () => run(() => uploadDeliverable({ segmentId: segment.id, folder, file, stage, ...link, onProgress: setSent }), `${STAGES[stage].label} uploaded`)
  const attach = () => run(() => markDeliverable({ segmentId: segment.id, path: picked, stage, ...link }), `${STAGES[stage].label} attached`)
  const detach = d => run(() => markDeliverable({ segmentId: segment.id, path: d.path, stage: d.stage, ...(target.type === 'subtask' ? { subtaskId: null } : { gateId: null }) }), 'Detached')
  const makeFolder = () => run(async () => {
    const created = await createSegmentFolder(segment.id, segment.title)
    queryClient.setQueryData(folderKey, created)
  }, 'Media folder created')

  let body
  if (!isMediaConfigured) body = <p className="text-sm text-gray-400">Media isn’t set up for the platform.</p>
  else if (folderLoading) body = <Spinner size={5} />
  else if (!folder && tab !== 'link') {
    body = (
      <div className="text-sm text-gray-400 space-y-3">
        <p>This segment doesn’t have a media folder yet.</p>
        <button type="button" onClick={makeFolder} disabled={busy} className="btn-primary text-sm">Create “{segment.title}” folder</button>
      </div>
    )
  } else if (tab === 'upload') {
    const pct = file && sent !== null ? Math.round((sent / file.size) * 100) : 0
    body = (
      <div className="space-y-4">
        <StagePicker stage={stage} onChange={setStage} />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
          className="w-full rounded-xl border-2 border-dashed border-gray-700 hover:border-brand-400 px-4 py-6 text-center transition-colors duration-fast">
          <Upload size={18} className="mx-auto text-gray-500 mb-1.5" aria-hidden="true" />
          <span className="block text-sm text-gray-200">{file ? file.name : 'Choose a file'}</span>
          <span className="block text-xs text-gray-500">{file ? formatBytes(file.size) : `Saved to ${folder}/${STAGES[stage].folder}`}</span>
        </button>
        <input ref={inputRef} type="file" hidden onChange={e => setFile(e.target.files?.[0] ?? null)} />
        {busy && file && (
          <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-brand-400 origin-left transition-transform" style={{ transform: `scaleX(${pct / 100})` }} />
          </div>
        )}
        <button type="button" onClick={upload} disabled={!file || busy} className="btn-primary w-full text-sm">
          {busy ? `Uploading… ${pct}%` : `Upload ${STAGES[stage].label.toLowerCase()}`}
        </button>
      </div>
    )
  } else if (tab === 'pick') {
    body = (
      <div className="space-y-4">
        <StagePicker stage={stage} onChange={setStage} />
        {listLoading ? <Spinner size={5} /> : (
          <ul className="max-h-60 overflow-y-auto rounded-xl border border-gray-800 divide-y divide-gray-800/70" role="listbox" aria-label="Files">
            {!candidates.length && <li className="p-3 text-sm text-gray-500">No files in this segment’s folder yet.</li>}
            {candidates.map(f => (
              <li key={f.path} role="option" aria-selected={picked === f.path}>
                <button type="button" onClick={() => setPicked(f.path)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm ${picked === f.path ? 'bg-brand-600/25 text-white' : 'text-gray-300 hover:bg-gray-800/60'}`}>
                  <span className="truncate flex-1">{f.name}</span>
                  {f.where && <span className="text-[10px] uppercase tracking-wide text-gray-500">{f.where}</span>}
                  <span className="text-xs text-gray-500 tabular-nums">{formatBytes(f.size)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={attach} disabled={!picked || busy} className="btn-primary w-full text-sm">Attach as {STAGES[stage].label.toLowerCase()}</button>
      </div>
    )
  } else {
    body = (
      <div className="space-y-4">
        <p className="text-xs text-gray-500">Paste a link to your deliverable (Google Doc, Drive file, YouTube, etc.)</p>
        <input className="input" type="url" inputMode="url" placeholder="https://..." value={url} aria-label="Deliverable link"
          onChange={e => setUrl(e.target.value)} autoFocus />
        <button type="button" className="btn-primary w-full text-sm"
          onClick={() => { onSaveLink(target.id, url.trim() || null); onClose() }}>Save link</button>
      </div>
    )
  }

  return (
    <Modal open onClose={onClose} title={`Submit for “${target.title}”`} size="md">
      <div className="space-y-5">
        {attached.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Attached</h3>
            <ul className="flex flex-wrap gap-2">
              {attached.map(d => (
                <li key={d.id} className="flex items-center gap-1">
                  <DeliverableChip deliverable={d} />
                  <button type="button" onClick={() => detach(d)} aria-label={`Detach ${d.path.split('/').pop()}`} className="p-1 text-gray-600 hover:text-red-400"><X size={12} /></button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex gap-1 rounded-lg bg-gray-800/70 p-1" role="tablist">
          {tabs.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors duration-fast ${tab === key ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
              {label}
            </button>
          ))}
        </div>
        {body}
      </div>
    </Modal>
  )
}
