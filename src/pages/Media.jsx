import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import PageHeader from '../components/ui/PageHeader'
import FileBrowser from '../components/media/FileBrowser'
import { useAuth } from '../context/AuthContext'
import { MediaError, isMediaConfigured, listSegmentFolders, memberSource, relinkFolder } from '../lib/media'
import { listAllDeliverables, markDeliverable, unmarkDeliverables } from '../lib/deliverables'

// Every folder on the media server, browsable like Finder. Top-level folders
// show which segments use them; renaming one keeps those segments linked.
export default function Media() {
  const { isExec } = useAuth()
  const queryClient = useQueryClient()
  const source = useMemo(() => memberSource(''), [])
  const { data: labels = {} } = useQuery({ queryKey: ['media', 'segmentFolders'], queryFn: listSegmentFolders, enabled: isMediaConfigured })
  const { data: allMarks = [] } = useQuery({ queryKey: ['media', 'allDeliverables'], queryFn: listAllDeliverables, enabled: isMediaConfigured })
  const marks = useMemo(() => Object.fromEntries(allMarks.map(d => [d.path, d.stage])), [allMarks])

  // A mark belongs to a segment, so files are marked for the segment their
  // top-level folder is linked to.
  async function onMark(paths, stage) {
    const segmentFor = path => labels[path.split('/')[0]]?.[0]?.id
    if (paths.some(p => !segmentFor(p))) throw new MediaError('Link this folder to a segment (from the segment’s Media tab) before marking drafts or finals.')
    if (stage) await Promise.all(paths.map(path => markDeliverable({ segmentId: segmentFor(path), path, stage })))
    else await Promise.all(paths.map(path => unmarkDeliverables(segmentFor(path), [path])))
    queryClient.invalidateQueries({ queryKey: ['media', 'allDeliverables'] })
    queryClient.invalidateQueries({ queryKey: ['segment'] })
  }

  async function onRenamed(from, to) {
    if (from.includes('/')) return
    await relinkFolder(from, to)
    queryClient.invalidateQueries({ queryKey: ['media', 'segmentFolders'] })
    queryClient.invalidateQueries({ queryKey: ['segment'] })
  }

  return (
    <div>
      <PageHeader title="Media" subtitle="Every folder on the TNN media server" />
      {isMediaConfigured
        ? <FileBrowser source={source} rootLabel="All folders" labels={labels} canDelete={isExec} canRenameTop={isExec} onRenamed={onRenamed} marks={marks} onMark={onMark} />
        : <p className="text-sm text-gray-400">Media isn’t set up. Add VITE_MEDIA_API_URL to the platform’s environment.</p>}
    </div>
  )
}
