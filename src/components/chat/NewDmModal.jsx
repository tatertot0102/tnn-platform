import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'

export default function NewDmModal({ open, onClose, members, profile, channels, channelMembers, onCreated }) {
  const [selected, setSelected] = useState([])
  const [saving, setSaving] = useState(false)

  function toggle(id) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  function findExistingDm(memberIds) {
    const wanted = new Set([...memberIds, profile.id])
    const dms = channels.filter(c => c.type === 'dm')
    return dms.find(c => {
      const ids = new Set(channelMembers.filter(cm => cm.channel_id === c.id).map(cm => cm.user_id))
      return ids.size === wanted.size && [...wanted].every(id => ids.has(id))
    })
  }

  async function handleCreate() {
    if (selected.length === 0) return
    setSaving(true)

    const existing = findExistingDm(selected)
    if (existing) {
      setSaving(false)
      onCreated(existing)
      setSelected([])
      onClose()
      return
    }

    const { data: channel, error } = await supabase
      .from('channels')
      .insert({ type: 'dm', created_by: profile.id })
      .select()
      .single()

    if (error || !channel) { setSaving(false); return }

    const memberIds = [...new Set([...selected, profile.id])]
    await supabase.from('channel_members').insert(memberIds.map(user_id => ({ channel_id: channel.id, user_id })))

    setSaving(false)
    onCreated(channel)
    setSelected([])
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="New Message" size="sm">
      <div className="space-y-4">
        <p className="text-xs text-gray-500">Pick one or more people to message.</p>
        <div className="flex flex-wrap gap-2 p-2 bg-gray-800 rounded-lg max-h-56 overflow-y-auto">
          {members.filter(m => m.id !== profile.id).map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => toggle(m.id)}
              className={`text-xs px-2 py-1 rounded-md transition-colors ${selected.includes(m.id) ? 'bg-brand-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-gray-200'}`}
            >
              {m.full_name}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleCreate} disabled={selected.length === 0 || saving} className="btn-primary flex items-center gap-2">
            {saving && <Spinner size={4} />} Start
          </button>
        </div>
      </div>
    </Modal>
  )
}
