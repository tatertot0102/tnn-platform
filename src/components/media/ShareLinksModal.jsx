import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Link2 } from 'lucide-react'
import { format, formatDistanceToNowStrict } from 'date-fns'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'
import { createShareLink, listShareLinks, revokeShareLink, shareUrl } from '../../lib/media'
import { StageBadge } from './DeliverableChip'

const EXPIRY_OPTIONS = [
  { value: 0, label: 'Never expires' },
  { value: 1, label: '1 day' },
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
]

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button type="button" onClick={copy} className="btn-ghost border border-gray-700 flex items-center gap-1.5 text-xs px-2.5 py-1.5">
      {copied ? <Check size={13} className="text-green-400" aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

/**
 * View-only links to this segment's folder. Anyone with the link can watch and
 * download; nobody can upload or delete through it.
 * @param {{ open: boolean, onClose: () => void, segmentId: string }} props
 */
export default function ShareLinksModal({ open, onClose, segmentId }) {
  const toast = useToast()
  const { profile, isExec } = useAuth()
  const queryClient = useQueryClient()
  const key = ['segment', segmentId, 'shareLinks']
  const [label, setLabel] = useState('')
  const [expiresInDays, setExpiresInDays] = useState(0)
  const [finalsOnly, setFinalsOnly] = useState(false)

  const { data: links = [], isLoading } = useQuery({ queryKey: key, queryFn: () => listShareLinks(segmentId), enabled: open })

  const create = useMutation({
    mutationFn: () => createShareLink(segmentId, { label, expiresInDays, finalsOnly }),
    onSuccess: async link => {
      setLabel('')
      queryClient.invalidateQueries({ queryKey: key })
      await navigator.clipboard.writeText(shareUrl(link.token)).catch(() => {})
      toast.success('Share link created and copied')
    },
    onError: err => toast.error(err.message),
  })

  const revoke = useMutation({
    mutationFn: revokeShareLink,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: key }); toast.success('Link turned off') },
    onError: err => toast.error(err.message),
  })

  return (
    <Modal open={open} onClose={onClose} title="Share links" size="md">
      <form onSubmit={e => { e.preventDefault(); create.mutate() }} className="space-y-3">
        <p className="text-sm text-gray-400">
          Anyone with a link can watch and download this folder without an account. They can’t upload, delete or see other segments.
        </p>
        <div className="grid sm:grid-cols-[1fr_auto] gap-2">
          <input className="input" value={label} onChange={e => setLabel(e.target.value)} maxLength={80}
            placeholder="Who is it for? (optional)" aria-label="Link label" />
          <select className="input" value={expiresInDays} onChange={e => setExpiresInDays(Number(e.target.value))} aria-label="Expiry">
            {EXPIRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <label className="flex items-start gap-2.5 rounded-lg border border-gray-800 p-3 cursor-pointer hover:border-gray-700">
          <input type="checkbox" checked={finalsOnly} onChange={e => setFinalsOnly(e.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-500" />
          <span>
            <span className="block text-sm text-gray-200">Only show the final</span>
            <span className="block text-xs text-gray-500">They’ll only see files marked Final: no drafts, no raw footage.</span>
          </span>
        </label>
        <button type="submit" disabled={create.isPending} className="btn-primary flex items-center gap-1.5 text-sm">
          <Link2 size={15} aria-hidden="true" /> {create.isPending ? 'Creating…' : 'Create link'}
        </button>
      </form>

      <div className="mt-6 border-t border-gray-800 pt-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Active links</h3>
        {isLoading && <Spinner size={5} />}
        {!isLoading && !links.length && <p className="text-sm text-gray-500">No active links.</p>}
        <ul className="space-y-2">
          {links.map(link => {
            const canRevoke = isExec || link.created_by === profile?.id
            return (
              <li key={link.id} className="rounded-lg border border-gray-800 bg-gray-900/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-200 truncate">
                      {link.label || 'Untitled link'}
                      {link.finals_only && <span className="ml-2 align-middle"><StageBadge stage="final" /></span>}
                    </p>
                    <p className="text-xs text-gray-500">
                      {link.profiles?.full_name ? `${link.profiles.full_name} · ` : ''}
                      {format(new Date(link.created_at), 'MMM d')}
                      {' · '}
                      {link.expires_at ? `expires in ${formatDistanceToNowStrict(new Date(link.expires_at))}` : 'no expiry'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <CopyButton text={shareUrl(link.token)} />
                    {canRevoke && (
                      <button type="button" onClick={() => revoke.mutate(link.id)} disabled={revoke.isPending}
                        className="btn-ghost text-xs px-2.5 py-1.5 text-red-400 hover:text-red-300">
                        Turn off
                      </button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </Modal>
  )
}
