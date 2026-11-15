import { useState } from 'react'
import { Loader2, Star } from 'lucide-react'
import { useToast } from '../../context/ToastContext'
import { getFile } from '../../lib/media'
import { STAGES } from '../../lib/deliverables'
import PlayerModal from './PlayerModal'

/** Small "Draft · name" / "★ Final · name" pill. */
export function StageBadge({ stage, compact = false }) {
  const s = STAGES[stage]
  if (!s) return null
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${s.chip}`}>
      {stage === 'final' && <Star size={9} fill="currentColor" aria-hidden="true" />}
      {!compact && s.label}
      {compact && <span className="sr-only">{s.label}</span>}
    </span>
  )
}

/**
 * A draft/final attached to a subtask or gate. Click to watch it.
 * @param {{ deliverable: { path: string, stage: string } }} props
 */
export default function DeliverableChip({ deliverable }) {
  const toast = useToast()
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const name = deliverable.path.split('/').pop()

  async function open(e) {
    e.stopPropagation()
    setLoading(true)
    try {
      setFile(await getFile(deliverable.path))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button type="button" onClick={open} title={`Watch ${name}`}
        className={`inline-flex max-w-[14rem] items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors duration-fast hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${STAGES[deliverable.stage].chip}`}>
        {loading ? <Loader2 size={11} className="animate-spin" aria-hidden="true" />
          : deliverable.stage === 'final' ? <Star size={11} fill="currentColor" aria-hidden="true" /> : null}
        <span className="font-semibold">{STAGES[deliverable.stage].label}</span>
        <span className="truncate opacity-80">{name}</span>
      </button>
      {file && <PlayerModal file={file} onClose={() => setFile(null)} />}
    </>
  )
}
