import { useState } from 'react'
import Modal from '../../ui/Modal'

// Mounted only while open, so the field starts from the task it was opened for.
export default function SubmitUrlModal({ task, onClose, onSave }) {
  const [url, setUrl] = useState(task?.submit_url ?? '')
  function handleSave() { onSave(task.id, url.trim() || null); onClose() }
  return (
    <Modal open onClose={onClose} title="Submit Link" size="sm">
      <div className="space-y-4">
        <p className="text-xs text-gray-500">Paste a link to your deliverable (Google Doc, Drive file, YouTube, etc.)</p>
        <input className="input" type="url" inputMode="url" placeholder="https://..." value={url}
          aria-label="Deliverable link"
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()} autoFocus />
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleSave} className="btn-primary">Save Link</button>
        </div>
      </div>
    </Modal>
  )
}
