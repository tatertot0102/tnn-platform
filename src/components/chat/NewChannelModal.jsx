import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'

export default function NewChannelModal({ open, onClose, members, profile, onCreated }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('channel')
  const [audience, setAudience] = useState('everyone')
  const [specificIds, setSpecificIds] = useState([])
  const [saving, setSaving] = useState(false)

  function reset() {
    setName(''); setType('channel'); setAudience('everyone'); setSpecificIds([])
  }

  async function handleCreate() {
    if (!name.trim()) return
    setSaving(true)

    const { data: channel, error } = await supabase
      .from('channels')
      .insert({ type, name: name.trim(), read_only: type === 'announcement', created_by: profile.id })
      .select()
      .single()

    if (error || !channel) { setSaving(false); return }

    let memberIds
    if (audience === 'everyone') memberIds = members.map(m => m.id)
    else if (audience === 'execs') memberIds = members.filter(m => ['exec', 'admin'].includes(m.role)).map(m => m.id)
    else memberIds = specificIds

    if (!memberIds.includes(profile.id)) memberIds = [...memberIds, profile.id]

    await supabase.from('channel_members').insert(memberIds.map(user_id => ({ channel_id: channel.id, user_id })))

    setSaving(false)
    onCreated(channel)
    reset()
    onClose()
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="New Channel" size="sm">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Name</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. sports-desk" autoFocus />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Type</label>
          <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
            {[['channel', 'Channel'], ['announcement', 'Announcement (read-only)']].map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setType(v)}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${type === v ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {l}
              </button>
            ))}
          </div>
          {type === 'announcement' && (
            <p className="text-xs text-gray-600 mt-1.5">Only execs can post. Every post also emails everyone in the channel.</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Who's in it?</label>
          <div className="flex gap-1 bg-gray-800 rounded-lg p-1 mb-2">
            {[['everyone', 'Everyone'], ['execs', 'Execs only'], ['specific', 'Specific people']].map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setAudience(v)}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${audience === v ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {l}
              </button>
            ))}
          </div>
          {audience === 'specific' && (
            <div className="flex flex-wrap gap-2 p-2 bg-gray-800 rounded-lg max-h-40 overflow-y-auto">
              {members.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSpecificIds(ids => ids.includes(m.id) ? ids.filter(x => x !== m.id) : [...ids, m.id])}
                  className={`text-xs px-2 py-1 rounded-md transition-colors ${specificIds.includes(m.id) ? 'bg-brand-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-gray-200'}`}
                >
                  {m.full_name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button onClick={() => { reset(); onClose() }} className="btn-ghost">Cancel</button>
          <button onClick={handleCreate} disabled={!name.trim() || saving} className="btn-primary flex items-center gap-2">
            {saving && <Spinner size={4} />} Create
          </button>
        </div>
      </div>
    </Modal>
  )
}
