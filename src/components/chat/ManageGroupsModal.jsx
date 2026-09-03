import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'
import { Trash2 } from 'lucide-react'

export default function ManageGroupsModal({ open, onClose, channels, groups, groupMembers, profile, onChanged }) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState([])
  const [saving, setSaving] = useState(false)

  const linkable = channels.filter(c => c.type !== 'dm')

  async function handleCreate() {
    if (!name.trim() || selected.length < 2) return
    setSaving(true)
    const { data: group } = await supabase.from('channel_groups').insert({ name: name.trim(), created_by: profile.id }).select().single()
    if (group) {
      await supabase.from('channel_group_members').insert(selected.map(channel_id => ({ group_id: group.id, channel_id })))
    }
    setSaving(false)
    setName(''); setSelected([])
    onChanged()
  }

  async function handleDeleteGroup(groupId) {
    if (!confirm('Remove this channel group? Channels stay, just ungrouped.')) return
    await supabase.from('channel_groups').delete().eq('id', groupId)
    onChanged()
  }

  return (
    <Modal open={open} onClose={onClose} title="Manage Channel Groups" size="md">
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Existing groups</p>
          {groups.length === 0 && <p className="text-xs text-gray-600">No groups yet.</p>}
          <div className="space-y-2">
            {groups.map(g => {
              const members = groupMembers.filter(gm => gm.group_id === g.id)
              return (
                <div key={g.id} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                  <div>
                    <p className="text-sm text-gray-200 font-medium">{g.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {members.map(m => channels.find(c => c.id === m.channel_id)?.name).filter(Boolean).join(', ')}
                    </p>
                  </div>
                  <button onClick={() => handleDeleteGroup(g.id)} className="text-gray-600 hover:text-red-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        <div className="pt-4 border-t border-gray-800">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">New group</p>
          <input className="input mb-3" placeholder="Group name..." value={name} onChange={e => setName(e.target.value)} />
          <div className="flex flex-wrap gap-2 p-2 bg-gray-800 rounded-lg max-h-48 overflow-y-auto mb-3">
            {linkable.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelected(s => s.includes(c.id) ? s.filter(x => x !== c.id) : [...s, c.id])}
                className={`text-xs px-2 py-1 rounded-md transition-colors ${selected.includes(c.id) ? 'bg-brand-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-gray-200'}`}
              >
                {c.name || 'Untitled'}
              </button>
            ))}
          </div>
          <button onClick={handleCreate} disabled={!name.trim() || selected.length < 2 || saving} className="btn-primary flex items-center gap-2 text-xs px-3 py-1.5">
            {saving && <Spinner size={4} />} Create group ({selected.length} channels)
          </button>
        </div>
      </div>
    </Modal>
  )
}
