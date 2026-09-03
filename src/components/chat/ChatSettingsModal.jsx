import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'
import PeopleDropdown from '../ui/PeopleDropdown'
import NewChannelModal from './NewChannelModal'
import { useToast } from '../../context/ToastContext'
import { Trash2, Pencil, Plus, Hash, Megaphone, X, Check, FolderPlus } from 'lucide-react'

function ChannelRow({ channel, channelMembers, allMembers, onChanged }) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(channel.name ?? '')
  const [type, setType] = useState(channel.type)
  const [memberIds, setMemberIds] = useState(channelMembers.filter(m => m.channel_id === channel.id).map(m => m.user_id))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const currentMemberIds = channelMembers.filter(m => m.channel_id === channel.id).map(m => m.user_id)

  async function handleSave() {
    setSaving(true)
    const { error: chError } = await supabase
      .from('channels')
      .update({ name: name.trim(), type, read_only: type === 'announcement' })
      .eq('id', channel.id)

    const toAdd = memberIds.filter(id => !currentMemberIds.includes(id))
    const toRemove = currentMemberIds.filter(id => !memberIds.includes(id))

    const [addResult, removeResult] = await Promise.all([
      toAdd.length ? supabase.from('channel_members').insert(toAdd.map(user_id => ({ channel_id: channel.id, user_id }))) : Promise.resolve({}),
      toRemove.length ? supabase.from('channel_members').delete().eq('channel_id', channel.id).in('user_id', toRemove) : Promise.resolve({}),
    ])

    setSaving(false)
    if (chError || addResult.error || removeResult.error) {
      toast.error('Could not save channel changes.')
      return
    }
    setEditing(false)
    onChanged()
  }

  async function handleDelete() {
    if (!confirm(`Delete #${channel.name}? This deletes all its messages too.`)) return
    setDeleting(true)
    const { error } = await supabase.from('channels').delete().eq('id', channel.id)
    setDeleting(false)
    if (error) { toast.error('Could not delete channel.'); return }
    onChanged()
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
        <div className="flex items-center gap-2 min-w-0">
          {channel.type === 'announcement' ? <Megaphone size={14} className="text-red-400 flex-shrink-0" /> : <Hash size={14} className="text-gray-500 flex-shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm text-gray-200 font-medium truncate">{channel.name || 'Untitled'}</p>
            <p className="text-xs text-gray-500">{currentMemberIds.length} member{currentMemberIds.length !== 1 ? 's' : ''}{channel.segment_id ? ' · segment-linked' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setEditing(true)} className="text-gray-500 hover:text-gray-200 transition-colors" title="Edit">
            <Pencil size={14} />
          </button>
          <button onClick={handleDelete} disabled={deleting} className="text-gray-600 hover:text-red-400 transition-colors" title="Delete">
            {deleting ? <Spinner size={4} /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 bg-gray-800/50 rounded-lg space-y-2.5">
      <div className="flex gap-2">
        <input className="input text-sm flex-1" value={name} onChange={e => setName(e.target.value)} placeholder="Channel name" />
        <select className="input text-sm w-auto" value={type} onChange={e => setType(e.target.value)}>
          <option value="channel">Channel</option>
          <option value="announcement">Announcement</option>
        </select>
      </div>
      <PeopleDropdown
        options={allMembers.map(m => ({ id: m.id, label: m.full_name }))}
        selectedIds={memberIds}
        onChange={setMemberIds}
        placeholder="Members..."
      />
      <div className="flex justify-end gap-2">
        <button onClick={() => setEditing(false)} className="btn-ghost text-xs px-3 py-1.5">Cancel</button>
        <button onClick={handleSave} disabled={saving || !name.trim()} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
          {saving ? <Spinner size={4} /> : <Check size={12} />} Save
        </button>
      </div>
    </div>
  )
}

function GroupRow({ group, channels, groupMembers, onChanged }) {
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [addChannelId, setAddChannelId] = useState('')

  const memberChannelIds = groupMembers.filter(gm => gm.group_id === group.id).map(gm => gm.channel_id)
  const memberChannels = memberChannelIds.map(id => channels.find(c => c.id === id)).filter(Boolean)
  const available = channels.filter(c => c.type !== 'dm' && !memberChannelIds.includes(c.id))

  async function handleAdd() {
    if (!addChannelId) return
    const { error } = await supabase.from('channel_group_members').insert({ group_id: group.id, channel_id: addChannelId })
    if (error) { toast.error('Could not add channel to group.'); return }
    setAddChannelId('')
    setAdding(false)
    onChanged()
  }

  async function handleRemove(channelId) {
    const { error } = await supabase.from('channel_group_members').delete().eq('group_id', group.id).eq('channel_id', channelId)
    if (error) { toast.error('Could not remove channel from group.'); return }
    onChanged()
  }

  async function handleDeleteGroup() {
    if (!confirm(`Remove the "${group.name}" group? Channels stay, just ungrouped.`)) return
    const { error } = await supabase.from('channel_groups').delete().eq('id', group.id)
    if (error) { toast.error('Could not delete group.'); return }
    onChanged()
  }

  return (
    <div className="p-3 bg-gray-800/50 rounded-lg space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-200 font-medium">{group.name}</p>
        <button onClick={handleDeleteGroup} className="text-gray-600 hover:text-red-400 transition-colors">
          <Trash2 size={14} />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {memberChannels.map(c => (
          <span key={c.id} className="inline-flex items-center gap-1 bg-gray-700 text-gray-200 text-xs rounded-full pl-2 pr-1 py-0.5">
            {c.name}
            <button onClick={() => handleRemove(c.id)} className="hover:bg-gray-600 rounded-full p-0.5 transition-colors">
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      {adding ? (
        <div className="flex gap-2">
          <select className="input text-xs flex-1" value={addChannelId} onChange={e => setAddChannelId(e.target.value)}>
            <option value="">Pick a channel...</option>
            {available.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={handleAdd} disabled={!addChannelId} className="btn-primary text-xs px-2 py-1.5">Add</button>
          <button onClick={() => setAdding(false)} className="btn-ghost text-xs px-2 py-1.5">Cancel</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-400 transition-colors">
          <Plus size={12} /> Add channel
        </button>
      )}
    </div>
  )
}

export default function ChatSettingsModal({ open, onClose, channels, channelMembers, groups, groupMembers, allMembers, profile, onChanged }) {
  const toast = useToast()
  const [tab, setTab] = useState('channels')
  const [showNewChannel, setShowNewChannel] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupChannels, setNewGroupChannels] = useState([])
  const [savingGroup, setSavingGroup] = useState(false)

  const nonDmChannels = channels.filter(c => c.type !== 'dm')

  async function handleCreateGroup() {
    if (!newGroupName.trim() || newGroupChannels.length < 2) return
    setSavingGroup(true)
    const { data: group, error } = await supabase.from('channel_groups').insert({ name: newGroupName.trim(), created_by: profile.id }).select().single()
    if (!error && group) {
      await supabase.from('channel_group_members').insert(newGroupChannels.map(channel_id => ({ group_id: group.id, channel_id })))
    }
    setSavingGroup(false)
    if (error) { toast.error('Could not create group.'); return }
    setNewGroupName('')
    setNewGroupChannels([])
    onChanged()
  }

  return (
    <Modal open={open} onClose={onClose} title="Chat Settings" size="lg">
      <div className="space-y-5">
        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          {[['channels', 'Channels'], ['groups', 'Groups']].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setTab(v)}
              className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === v ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {l}
            </button>
          ))}
        </div>

        {tab === 'channels' && (
          <div className="space-y-3">
            <button onClick={() => setShowNewChannel(true)} className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5">
              <Plus size={13} /> New Channel
            </button>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {nonDmChannels.length === 0 && <p className="text-xs text-gray-600">No channels yet.</p>}
              {nonDmChannels.map(c => (
                <ChannelRow key={c.id} channel={c} channelMembers={channelMembers} allMembers={allMembers} onChanged={onChanged} />
              ))}
            </div>
          </div>
        )}

        {tab === 'groups' && (
          <div className="space-y-5">
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {groups.length === 0 && <p className="text-xs text-gray-600">No groups yet.</p>}
              {groups.map(g => (
                <GroupRow key={g.id} group={g} channels={channels} groupMembers={groupMembers} onChanged={onChanged} />
              ))}
            </div>

            <div className="pt-4 border-t border-gray-800">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <FolderPlus size={13} /> New group
              </p>
              <input className="input mb-2 text-sm" placeholder="Group name..." value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
              <div className="flex flex-wrap gap-2 p-2 bg-gray-800 rounded-lg max-h-40 overflow-y-auto mb-3">
                {nonDmChannels.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setNewGroupChannels(s => s.includes(c.id) ? s.filter(x => x !== c.id) : [...s, c.id])}
                    className={`text-xs px-2 py-1 rounded-md transition-colors ${newGroupChannels.includes(c.id) ? 'bg-brand-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-gray-200'}`}
                  >
                    {c.name || 'Untitled'}
                  </button>
                ))}
              </div>
              <button
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim() || newGroupChannels.length < 2 || savingGroup}
                className="btn-primary flex items-center gap-2 text-xs px-3 py-1.5"
              >
                {savingGroup && <Spinner size={4} />} Create group ({newGroupChannels.length} channels)
              </button>
            </div>
          </div>
        )}
      </div>

      <NewChannelModal
        open={showNewChannel}
        onClose={() => setShowNewChannel(false)}
        members={allMembers}
        profile={profile}
        onCreated={() => { onChanged() }}
      />
    </Modal>
  )
}
