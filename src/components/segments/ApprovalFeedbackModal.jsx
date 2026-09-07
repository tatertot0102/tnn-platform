import { useState } from 'react'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'

const COPY = {
  comment: { title: 'Add Feedback', cta: 'Post Feedback', hint: 'Posted to the segment channel and sent to everyone on this gate.' },
  approved: { title: 'Approve Gate', cta: 'Approve', hint: 'Optional note. Approving posts to the segment channel.' },
  changes_requested: { title: 'Request Changes', cta: 'Request Changes', hint: 'Say what needs to change before this can be approved.' },
}

export default function ApprovalFeedbackModal({ open, onClose, onSubmit, gate, kind = 'comment' }) {
  const [body, setBody]     = useState('')
  const [saving, setSaving] = useState(false)
  const copy = COPY[kind] ?? COPY.comment
  const required = kind !== 'approved'

  async function handleSubmit() {
    if (required && !body.trim()) return
    setSaving(true)
    await onSubmit(body.trim())
    setSaving(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={copy.title} size="sm">
      <div className="space-y-4">
        {gate && <p className="text-xs text-gray-500">On <span className="text-gray-300">{gate.title}</span></p>}
        <textarea className="input min-h-32 resize-y" rows={5} autoFocus
          placeholder={kind === 'approved' ? 'Optional note...' : 'Write your feedback...'}
          value={body} onChange={e => setBody(e.target.value)} />
        <p className="text-[11px] text-gray-600">{copy.hint}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || (required && !body.trim())}
            className="btn-primary flex items-center gap-2">
            {saving && <Spinner size={4} />} {copy.cta}
          </button>
        </div>
      </div>
    </Modal>
  )
}
