import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderOpen, Share2 } from 'lucide-react'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import {
  createSegmentFolder, getSegmentFolder, isMediaConfigured, linkSegmentFolder, createFolder, memberSource,
} from '../../lib/media'
import FileBrowser from './FileBrowser'
import FolderSetup from './FolderSetup'
import ShareLinksModal from './ShareLinksModal'
import DeliverableChip from './DeliverableChip'
import { markDeliverable, unmarkDeliverables, useDeliverables } from '../../lib/deliverables'

function Notice({ title, children, action }) {
  return (
    <div className="card p-8 text-center">
      <FolderOpen size={28} className="mx-auto text-gray-600 mb-3" aria-hidden="true" />
      <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
      <p className="mt-1 text-sm text-gray-400 max-w-md mx-auto">{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

function FolderView({ segmentId, folder, onChangeFolder, canChange }) {
  const [sharing, setSharing] = useState(false)
  const { isExec } = useAuth()
  const source = useMemo(() => memberSource(folder), [folder])
  const queryClient = useQueryClient()
  const deliverables = useDeliverables(segmentId)
  const marks = useMemo(() => Object.fromEntries(deliverables.list.map(d => [d.path, d.stage])), [deliverables.list])
  const finals = deliverables.list.filter(d => d.stage === 'final')
  const drafts = deliverables.list.filter(d => d.stage === 'draft')

  async function onMark(paths, stage) {
    if (stage) await Promise.all(paths.map(path => markDeliverable({ segmentId, path, stage })))
    else await unmarkDeliverables(segmentId, paths)
    deliverables.refresh()
    queryClient.invalidateQueries({ queryKey: ['media', 'allDeliverables'] })
  }
  const actions = (
    <>
      {canChange && <button type="button" onClick={onChangeFolder} className="btn-ghost border border-gray-700 text-xs px-2.5 py-1.5">Change folder</button>}
      <button type="button" onClick={() => setSharing(true)} className="btn-ghost border border-gray-700 flex items-center gap-1.5 text-xs px-2.5 py-1.5">
        <Share2 size={13} aria-hidden="true" /> Share
      </button>
    </>
  )
  return (
    <>
      {deliverables.list.length > 0 && (
        <section aria-label="Deliverables" className="card mb-4 p-4 grid gap-4 md:grid-cols-[auto_1fr] md:items-start">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 mb-2">Final</h3>
            <div className="flex flex-wrap gap-2">
              {finals.length ? finals.map(d => <DeliverableChip key={d.id} deliverable={d} />) : <span className="text-xs text-gray-500">No final yet</span>}
            </div>
          </div>
          <div className="md:border-l md:border-gray-800 md:pl-4 min-w-0">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-amber-400 mb-2">Drafts <span className="text-gray-500">· newest first</span></h3>
            <div className="flex flex-wrap gap-2">
              {drafts.length ? drafts.map(d => <DeliverableChip key={d.id} deliverable={d} />) : <span className="text-xs text-gray-500">No drafts yet</span>}
            </div>
          </div>
        </section>
      )}
      <FileBrowser source={source} rootLabel={folder} canDelete={isExec} actions={actions} marks={marks} onMark={onMark} />
      <ShareLinksModal open={sharing} onClose={() => setSharing(false)} segmentId={segmentId} />
    </>
  )
}

/**
 * The Media tab on a segment: its folder on the media server, uploads and share links.
 * @param {{ segment: { id: string, title: string } }} props
 */
export default function SegmentMedia({ segment }) {
  const { isExec } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [changing, setChanging] = useState(false)
  const folderKey = ['segment', segment.id, 'mediaFolder']
  const { data: folder, isLoading, error } = useQuery({
    queryKey: folderKey, queryFn: () => getSegmentFolder(segment.id), enabled: isMediaConfigured,
  })

  async function run(action, successMessage) {
    setBusy(true)
    try {
      const linked = await action()
      queryClient.setQueryData(folderKey, linked)
      queryClient.invalidateQueries({ queryKey: ['media', 'folders'] })
      setChanging(false)
      toast.success(successMessage)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const replace = Boolean(folder)
  const onCreate = () => run(
    () => (replace ? createFolder(segment.title).then(name => linkSegmentFolder(segment.id, name, { replace })) : createSegmentFolder(segment.id, segment.title)),
    'Folder created',
  )
  const onLink = name => run(() => linkSegmentFolder(segment.id, name, { replace }), 'Folder linked')

  if (!isMediaConfigured) {
    return <Notice title="Media isn’t set up">Add VITE_MEDIA_API_URL to the platform’s environment to turn on segment media.</Notice>
  }
  if (isLoading) return <div className="py-10 flex justify-center"><Spinner size={6} /></div>
  if (error) return <Notice title="Couldn’t load media">{error.message}</Notice>
  if (!folder) return <FolderSetup title={segment.title} busy={busy} onCreate={onCreate} onLink={onLink} />

  return (
    <>
      <FolderView segmentId={segment.id} folder={folder} canChange={isExec} onChangeFolder={() => setChanging(true)} />
      <Modal open={changing} onClose={() => setChanging(false)} title="Change folder" size="lg">
        <p className="text-sm text-gray-400 mb-4">Files stay where they are. This only changes which folder this segment shows. Existing share links will show the new folder.</p>
        <FolderSetup title={segment.title} busy={busy} onCreate={onCreate} onLink={onLink} current={folder} />
      </Modal>
    </>
  )
}
