import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Spinner from '../components/ui/Spinner'
import MessageComposer from '../components/chat/MessageComposer'
import ChatSettingsModal from '../components/chat/ChatSettingsModal'
import NewDmModal from '../components/chat/NewDmModal'
import { format } from 'date-fns'
import { Hash, Megaphone, MessageCircle, Plus, Link2, Lock, Mail, ArrowLeft, Settings } from 'lucide-react'
import { splitBodyWithMentions } from '../lib/chat'
import MentionChip from '../components/chat/MentionChip'
import ErrorState from '../components/ui/ErrorState'
import { useToast } from '../context/ToastContext'

function MessageBody({ body, mentions }) {
  return (
    <>
      {splitBodyWithMentions(body, mentions).map((part, i) =>
        part.type === 'mention'
          ? <MentionChip key={i} mention={part.mention} />
          : <span key={i}>{part.value}</span>
      )}
    </>
  )
}

function EmailCard({ msg }) {
  return (
    <div className="border border-brand-800/50 bg-brand-950/20 rounded-xl p-3 max-w-lg">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-300 uppercase tracking-wider mb-2">
        <Mail size={12} /> Email · {msg.email_subject}
      </p>
      <div className="flex flex-wrap gap-1 mb-2">
        {(msg.email_to ?? []).map(r => (
          <span key={r.id} className="badge bg-gray-800 text-gray-300 text-[10px]">{r.label}</span>
        ))}
      </div>
      <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">{msg.body}</p>
    </div>
  )
}

function SidebarSection({ title, children }) {
  return (
    <div className="mb-4">
      <p className="px-3 pb-1 text-xs font-semibold text-gray-600 uppercase tracking-wider">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function ChannelItem({ icon: Icon, label, active, onClick, sub }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors text-left ${
        active ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
      }`}
    >
      <Icon size={14} className="flex-shrink-0" />
      <span className="truncate flex-1">{label}</span>
      {sub}
    </button>
  )
}

export default function Chat() {
  const { profile, isExec } = useAuth()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [channels, setChannels] = useState([])
  const [channelMembers, setChannelMembers] = useState([]) // { channel_id, user_id, profiles }
  const [groups, setGroups] = useState([])
  const [groupMembers, setGroupMembers] = useState([])
  const [allMembers, setAllMembers] = useState([])
  const [segments, setSegments] = useState([])
  const [subtasks, setSubtasks] = useState([])
  const [tasks, setTasks] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [messages, setMessages] = useState([])
  const [showSettings, setShowSettings] = useState(false)
  const [showNewDm, setShowNewDm] = useState(false)

  useEffect(() => { if (profile) fetchAll() }, [profile])

  async function fetchAll() {
    setLoading(true)
    setLoadError(false)
    const results = await Promise.all([
      supabase.from('channels').select('*').order('created_at'),
      supabase.from('channel_members').select('channel_id, user_id, profiles(id, full_name, email, role)'),
      supabase.from('channel_groups').select('*'),
      supabase.from('channel_group_members').select('*'),
      supabase.from('profiles').select('id, full_name, email, role'),
      supabase.from('segments').select('id, title'),
      supabase.from('subtasks').select('id, title, segment_id'),
      supabase.from('tasks').select('id, title, assignee_ids').is('parent_task_id', null),
    ])

    if (results.some(r => r.error)) {
      setLoadError(true)
      toast.error('Could not load chat. Check your connection and retry.')
      setLoading(false)
      return
    }

    const [
      { data: chs }, { data: mems }, { data: grps }, { data: grpMems },
      { data: allMem }, { data: segs }, { data: subs }, { data: tsks },
    ] = results
    setChannels(chs ?? [])
    setChannelMembers(mems ?? [])
    setGroups(grps ?? [])
    setGroupMembers(grpMems ?? [])
    setAllMembers(allMem ?? [])
    setSegments(segs ?? [])
    setSubtasks(subs ?? [])
    setTasks(tsks ?? [])
    setLoading(false)
    setSelectedId(prev => prev ?? (chs ?? []).find(c => c.type !== 'dm')?.id ?? (chs ?? [])[0]?.id ?? null)
  }

  useEffect(() => {
    if (!selectedId) { setMessages([]); return }
    let active = true

    supabase.from('messages').select('*').eq('channel_id', selectedId).order('created_at')
      .then(({ data, error }) => {
        if (!active) return
        if (error) { toast.error('Could not load messages for this channel.'); return }
        setMessages(data ?? [])
      })

    const sub = supabase
      .channel(`messages-${selectedId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${selectedId}` },
        payload => setMessages(m => m.some(x => x.id === payload.new.id) ? m : [...m, payload.new]))
      .subscribe()

    return () => { active = false; supabase.removeChannel(sub) }
  }, [selectedId])

  const myChannelIds = useMemo(
    () => new Set(channelMembers.filter(cm => cm.user_id === profile?.id).map(cm => cm.channel_id)),
    [channelMembers, profile]
  )
  const visibleChannels = isExec ? channels : channels.filter(c => myChannelIds.has(c.id))
  const selected = channels.find(c => c.id === selectedId)

  const selectedMembers = useMemo(
    () => channelMembers.filter(cm => cm.channel_id === selectedId).map(cm => cm.profiles).filter(Boolean),
    [channelMembers, selectedId]
  )

  function dmLabel(channel) {
    const ids = channelMembers.filter(cm => cm.channel_id === channel.id).map(cm => cm.user_id)
    const others = allMembers.filter(m => ids.includes(m.id) && m.id !== profile.id)
    return others.map(m => m.full_name).join(', ') || 'Just you'
  }

  const dms = visibleChannels.filter(c => c.type === 'dm')
  const announcements = visibleChannels.filter(c => c.type === 'announcement')
  const regular = visibleChannels.filter(c => c.type === 'channel')
  const groupedChannelIds = new Set(groupMembers.map(g => g.channel_id))
  const ungroupedRegular = regular.filter(c => !groupedChannelIds.has(c.id))
  const groupsWithVisibleChannels = groups
    .map(g => ({
      group: g,
      items: groupMembers.filter(gm => gm.group_id === g.id)
        .map(gm => visibleChannels.find(c => c.id === gm.channel_id))
        .filter(Boolean),
    }))
    .filter(g => g.items.length > 0)

  const segment = selected?.segment_id ? segments.find(s => s.id === selected.segment_id) : null
  const canPost = !!selected && (isExec || selected.type !== 'announcement')

  if (loading) return <div className="flex justify-center py-24"><Spinner size={8} /></div>
  if (loadError) return <ErrorState message="Could not load chat." onRetry={fetchAll} />

  return (
    <div className="fixed inset-y-0 right-0 left-0 md:left-56 flex border-t border-gray-800 bg-gray-950">
      {/* Sidebar */}
      <div className={`${selectedId ? 'hidden md:flex' : 'flex'} w-full md:w-64 flex-shrink-0 border-r border-gray-800 flex-col overflow-hidden`}>
        <div className="p-3 pl-14 md:pl-3 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-200">Chat</h2>
          <div className="flex items-center gap-1">
            {isExec && (
              <button onClick={() => setShowSettings(true)} title="Chat settings" className="text-gray-500 hover:text-gray-200 p-1">
                <Settings size={15} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-3">
          <SidebarSection title="Direct Messages">
            <button onClick={() => setShowNewDm(true)} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors text-left">
              <Plus size={13} /> New message
            </button>
            {dms.map(c => (
              <ChannelItem key={c.id} icon={MessageCircle} label={dmLabel(c)} active={c.id === selectedId} onClick={() => setSelectedId(c.id)} />
            ))}
          </SidebarSection>

          <SidebarSection title="Channels">
            {ungroupedRegular.map(c => (
              <ChannelItem key={c.id} icon={Hash} label={c.name} active={c.id === selectedId} onClick={() => setSelectedId(c.id)}
                sub={c.segment_id && <Link2 size={11} className="text-purple-400 flex-shrink-0" />} />
            ))}
            {groupsWithVisibleChannels.map(({ group, items }) => (
              <div key={group.id} className="mt-2 border border-gray-800 rounded-lg p-1.5">
                <p className="px-1.5 pb-1 text-[10px] font-semibold text-purple-300 uppercase tracking-wider flex items-center gap-1">
                  <Link2 size={10} /> {group.name}
                </p>
                {items.map(c => (
                  <ChannelItem key={c.id} icon={Hash} label={c.name} active={c.id === selectedId} onClick={() => setSelectedId(c.id)} />
                ))}
              </div>
            ))}
          </SidebarSection>

          {announcements.length > 0 && (
            <SidebarSection title="Announcements">
              {announcements.map(c => (
                <ChannelItem key={c.id} icon={Megaphone} label={c.name} active={c.id === selectedId} onClick={() => setSelectedId(c.id)} />
              ))}
            </SidebarSection>
          )}

          {isExec && (
            <p className="px-3 mt-2 text-[11px] text-gray-700 flex items-center gap-1"><Lock size={10} /> Execs see every channel</p>
          )}
        </div>
      </div>

      {/* Thread */}
      <div className={`${selectedId ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0`}>
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">Select a channel to get started.</div>
        ) : (
          <>
            <div className="pl-14 md:pl-4 pr-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <div className="min-w-0 flex items-center gap-2">
                <button onClick={() => setSelectedId(null)} className="md:hidden text-gray-500 hover:text-gray-200 flex-shrink-0">
                  <ArrowLeft size={16} />
                </button>
                <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-100 flex items-center gap-1.5">
                  {selected.type === 'dm' ? <MessageCircle size={14} /> : selected.type === 'announcement' ? <Megaphone size={14} className="text-red-400" /> : <Hash size={14} />}
                  {selected.type === 'dm' ? dmLabel(selected) : selected.name}
                  {segment && (
                    <span className="badge bg-purple-900 text-purple-300 text-[10px] flex items-center gap-1">
                      <Link2 size={9} /> {segment.title}
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">{selectedMembers.length} member{selectedMembers.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.length === 0 && <p className="text-gray-600 text-sm">No messages yet.</p>}
              {messages.map(msg => {
                const sender = allMembers.find(m => m.id === msg.sender_id)
                return (
                  <div key={msg.id} className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                      {sender?.full_name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-gray-200">{sender?.full_name ?? 'Unknown'}</span>
                        <span className="text-[11px] text-gray-600">{format(new Date(msg.created_at), 'MMM d, h:mm a')}</span>
                      </div>
                      {msg.email_subject ? (
                        <div className="mt-1"><EmailCard msg={msg} /></div>
                      ) : (
                        <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">
                          <MessageBody body={msg.body} mentions={msg.mentions} />
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <MessageComposer
              channel={selected}
              channelMembers={selectedMembers}
              allMembers={allMembers}
              segments={segments}
              subtasks={subtasks}
              tasks={tasks}
              profile={profile}
              disabled={!canPost}
              disabledReason="Only execs can post in this announcement channel."
              onSent={msg => setMessages(m => m.some(x => x.id === msg.id) ? m : [...m, msg])}
            />
          </>
        )}
      </div>

      <NewDmModal open={showNewDm} onClose={() => setShowNewDm(false)} members={allMembers} profile={profile}
        channels={channels} channelMembers={channelMembers}
        onCreated={c => { fetchAll(); setSelectedId(c.id) }} />
      <ChatSettingsModal open={showSettings} onClose={() => setShowSettings(false)} channels={channels}
        channelMembers={channelMembers.map(cm => ({ channel_id: cm.channel_id, user_id: cm.user_id }))}
        groups={groups} groupMembers={groupMembers} allMembers={allMembers} profile={profile}
        onChanged={() => { fetchAll() }} />
    </div>
  )
}
