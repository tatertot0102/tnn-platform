import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FolderPlus, Link2 } from 'lucide-react'
import Spinner from '../ui/Spinner'
import { listFolders } from '../../lib/media'

/**
 * Lets someone give a segment a folder: make a new one named after the segment,
 * or pick an existing folder on the media server.
 * @param {{ title: string, busy: boolean, onCreate: () => void, onLink: (folder: string) => void, current?: string|null }} props
 */
export default function FolderSetup({ title, busy, onCreate, onLink, current = null }) {
  const [choice, setChoice] = useState('')
  const { data: folders = [], isLoading, error } = useQuery({ queryKey: ['media', 'folders'], queryFn: listFolders })
  const options = folders.filter(f => f.name !== current)

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="card p-5 flex flex-col">
        <FolderPlus size={20} className="text-brand-400 mb-3" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-gray-100">Create a new folder</h3>
        <p className="mt-1 text-sm text-gray-400 flex-1">
          Makes <span className="text-gray-200">“{title}”</span> on the media server and links it to this segment.
        </p>
        <button type="button" onClick={onCreate} disabled={busy} className="btn-primary mt-4 self-start text-sm">
          {busy ? 'Working…' : 'Create folder'}
        </button>
      </div>

      <div className="card p-5 flex flex-col">
        <Link2 size={20} className="text-brand-400 mb-3" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-gray-100">Link an existing folder</h3>
        <p className="mt-1 text-sm text-gray-400">Use footage that’s already on the media server.</p>
        {isLoading && <div className="mt-4"><Spinner size={5} /></div>}
        {error && <p className="mt-4 text-sm text-red-400">{error.message}</p>}
        {!isLoading && !error && (
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <select className="input flex-1" value={choice} onChange={e => setChoice(e.target.value)} aria-label="Existing folder">
              <option value="">{options.length ? 'Choose a folder…' : 'No other folders yet'}</option>
              {options.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
            </select>
            <button type="button" onClick={() => onLink(choice)} disabled={busy || !choice} className="btn-ghost border border-gray-700 text-sm">
              Link
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
