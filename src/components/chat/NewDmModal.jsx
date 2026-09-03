import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'
import PeopleDropdown from '../ui/PeopleDropdown'
import { useToast } from '../../context/ToastContext'

export default function NewDmModal({ open, onClose, members, profile, channels, channelMembers, onCreated }) {
  const toast = useToast()
  const [selected, setSelected] = useState([])
  const [saving, setSaving] = useState(false)

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

    if (error || !channel) { setSaving(false); toast.error('Could not start the conversation.'); return }

    const memberIds = [...new Set([...selected, profile.id])]
    const { error: memberError } = await supabase.from('channel_members').insert(memberIds.map(user_id => ({ channel_id: channel.id, user_id })))
    if (memberError) toast.error('Conversation created, but not everyone could be added.')

    setSaving(false)
    onCreated(channel)
    setSelected([])
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="New Message" size="sm">
      <div className="space-y-4">
        <p className="text-xs text-gray-500">Pick one or more people to message.</p>
        <PeopleDropdown
          options={members.filter(m => m.id !== profile.id).map(m => ({ id: m.id, label: m.full_name }))}
          selectedIds={selected}
          onChange={setSelected}
          placeholder="Search people..."
        />
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
