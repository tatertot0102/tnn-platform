import { useState } from 'react'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'

// Create or edit an approval gate. `gate` null means create. The parent mounts
// this only while it is open, so state initialises straight from props.
export default function ApprovalGateModal({ open, onClose, onSave, gate, members, milestones = [], defaultMilestoneId = null }) {
  const [title, setTitle]             = useState(gate?.title ?? '')
  const [description, setDescription] = useState(gate?.description ?? '')
  const [approverId, setApproverId]   = useState(gate?.approver_id ?? '')
  const [dueDate, setDueDate]         = useState(gate?.due_date ?? '')
  const [milestoneId, setMilestoneId] = useState(gate?.milestone_id ?? defaultMilestoneId ?? '')
  const [saving, setSaving]           = useState(false)

  async function handleSave() {
    if (!title.trim() || !approverId) return
    setSaving(true)
    await onSave({
      title: title.trim(),
      description: description.trim() || null,
      approver_id: approverId,
      due_date: dueDate || null,
      milestone_id: milestoneId || null,
    })
    setSaving(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={gate ? 'Edit Approval Gate' : 'New Approval Gate'}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Title</label>
          <input className="input" placeholder="e.g. Script sign-off" value={title}
            onChange={e => setTitle(e.target.value)} autoFocus />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Description</label>
          <textarea className="input min-h-24 resize-y" rows={4}
            placeholder="What has to be true before this is approved?"
            value={description} onChange={e => setDescription(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Approver</label>
            <select className="input" value={approverId} onChange={e => setApproverId(e.target.value)}>
              <option value="">Select person...</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
            <p className="text-[11px] text-gray-600 mt-1.5">They get a notification right away.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Due date</label>
            <input type="date" className="input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
        </div>

        {milestones.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Milestone</label>
            <select className="input" value={milestoneId} onChange={e => setMilestoneId(e.target.value)}>
              <option value="">Ungrouped</option>
              {milestones.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleSave} disabled={!title.trim() || !approverId || saving}
            className="btn-primary flex items-center gap-2">
            {saving && <Spinner size={4} />} {gate ? 'Save Changes' : 'Create Gate'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
