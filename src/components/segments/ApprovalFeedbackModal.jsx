import { useState } from 'react'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'
import ApprovalFeedbackCard from './ApprovalFeedbackCard'

const COPY = {
  comment: { title: 'Comments', cta: 'Post Comment', placeholder: 'Write a comment...' },
  changes_requested: { title: 'Request Changes', cta: 'Request Changes', placeholder: 'What needs to change?' },
}

// The comments thread on a gate. Every entry is mirrored into the segment's
// chat channel, so this shows the same card the channel does.
export default function ApprovalFeedbackModal({
  open, onClose, onSubmit, gate, feedback = [], members = [], segmentTitle, kind = 'comment',
}) {
  const [body, setBody]     = useState('')
  const [saving, setSaving] = useState(false)
  const copy = COPY[kind] ?? COPY.comment

  async function handleSubmit() {
    if (!body.trim()) return
    setSaving(true)
    await onSubmit(body.trim())
    setSaving(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={copy.title}>
      <div className="space-y-4">
        {gate && <p className="text-xs text-gray-500">On <span className="text-gray-300">{gate.title}</span></p>}

        {feedback.length > 0 && (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {feedback.map(f => (
              <ApprovalFeedbackCard key={f.id} kind={f.kind} gateTitle={gate?.title}
                segmentTitle={segmentTitle} body={f.body} createdAt={f.created_at}
                authorName={members.find(m => m.id === f.author_id)?.full_name} />
            ))}
          </div>
        )}

        <textarea className="input min-h-28 resize-y" rows={4} autoFocus
          placeholder={copy.placeholder} value={body} onChange={e => setBody(e.target.value)} />
        <p className="text-[11px] text-gray-600">Posted to the segment channel and sent to everyone on this gate.</p>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-ghost">Close</button>
          <button onClick={handleSubmit} disabled={saving || !body.trim()}
            className="btn-primary flex items-center gap-2">
            {saving && <Spinner size={4} />} {copy.cta}
          </button>
        </div>
      </div>
    </Modal>
  )
}
