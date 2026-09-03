import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { sendEmail } from '../../lib/chat'
import { Send, AtSign, Mail } from 'lucide-react'

function buildResults({ query, allMembers, channelMemberIds, segments, subtasks, tasks, profileId }) {
  const q = query.toLowerCase()
  const results = []

  if ('everyone'.startsWith(q)) {
    results.push({ type: 'everyone', id: null, label: 'everyone', sub: 'Notify everyone in this channel' })
  }

  const inChannel = (id) => channelMemberIds.has(id)
  ;[...allMembers]
    .filter(m => m.full_name?.toLowerCase().includes(q))
    .sort((a, b) => Number(!inChannel(a.id)) - Number(!inChannel(b.id)))
    .slice(0, 6)
    .forEach(m => results.push({
      type: 'user', id: m.id, label: m.full_name,
      sub: inChannel(m.id) ? 'In channel' : 'Adds to channel',
    }))

  segments
    .filter(s => s.title?.toLowerCase().includes(q))
    .slice(0, 4)
    .forEach(s => results.push({ type: 'segment', id: s.id, label: s.title, sub: 'Segment' }))

  subtasks
    .filter(t => t.title?.toLowerCase().includes(q))
    .slice(0, 4)
    .forEach(t => results.push({ type: 'subtask', id: t.id, label: t.title, sub: 'Deliverable' }))

  ;[...tasks]
    .filter(t => t.title?.toLowerCase().includes(q))
    .sort((a, b) => Number(!a.assignee_ids?.includes(profileId)) - Number(!b.assignee_ids?.includes(profileId)))
    .slice(0, 4)
    .forEach(t => results.push({ type: 'task', id: t.id, label: t.title, sub: 'Task' }))

  return results.slice(0, 12)
}

const TYPE_TAG = {
  everyone: 'bg-red-900 text-red-300',
  user: 'bg-brand-900 text-brand-300',
  segment: 'bg-purple-900 text-purple-300',
  subtask: 'bg-indigo-900 text-indigo-300',
  task: 'bg-teal-900 text-teal-300',
}

export default function MessageComposer({
  channel, channelMembers, allMembers, segments, subtasks, tasks, profile, onSent, disabled, disabledReason,
}) {
  const [text, setText] = useState('')
  const [mentions, setMentions] = useState([])
  const [popover, setPopover] = useState(null) // { start, end, results }
  const [sending, setSending] = useState(false)
  const taRef = useRef(null)

  const channelMemberIds = new Set(channelMembers.map(m => m.id))

  function handleChange(e) {
    const value = e.target.value
    setText(value)
    const cursor = e.target.selectionStart
    const before = value.slice(0, cursor)
    const match = before.match(/(?:^|\s)@([^\s@]*)$/)

    if (match) {
      const query = match[1]
      const start = cursor - query.length - 1
      const results = buildResults({
        query, allMembers, channelMemberIds, segments, subtasks, tasks, profileId: profile.id,
      })
      setPopover({ start, end: cursor, results })
    } else {
      setPopover(null)
    }
  }

  function pickResult(result) {
    if (!popover) return
    const label = result.label
    const before = text.slice(0, popover.start)
    const after = text.slice(popover.end)
    const insertion = `@${label} `
    const nextText = `${before}${insertion}${after}`
    setText(nextText)
    setMentions(m => {
      const key = `${result.type}:${result.id}`
      if (m.some(x => `${x.type}:${x.id}` === key)) return m
      return [...m, { type: result.type, id: result.id, label }]
    })
    setPopover(null)
    requestAnimationFrame(() => {
      const pos = before.length + insertion.length
      taRef.current?.focus()
      taRef.current?.setSelectionRange(pos, pos)
    })
  }

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || sending || disabled) return
    setSending(true)

    try {
      const isEmailCmd = /^\/email\b/i.test(trimmed)
      const bodyForEmail = isEmailCmd ? trimmed.replace(/^\/email\s*/i, '') : trimmed

      const present = mentions.filter(m => text.includes(`@${m.label}`))
      const userIds = new Set(present.filter(m => m.type === 'user').map(m => m.id))
      const segmentIds = [...new Set(present.filter(m => m.type === 'segment').map(m => m.id))]
      const taskIds = [...new Set(present.filter(m => m.type === 'task' || m.type === 'subtask').map(m => m.id))]
      const hasEveryone = present.some(m => m.type === 'everyone')

      if (hasEveryone) {
        channelMembers.forEach(m => { if (m.id !== profile.id) userIds.add(m.id) })
      }

      const toAdd = [...userIds].filter(id => !channelMemberIds.has(id))
      if (toAdd.length > 0) {
        await supabase.from('channel_members').insert(toAdd.map(user_id => ({ channel_id: channel.id, user_id })))
      }

      const { data: msg, error } = await supabase
        .from('messages')
        .insert({
          channel_id: channel.id,
          sender_id: profile.id,
          body: trimmed,
          mentioned_user_ids: [...userIds],
          mentioned_segment_ids: segmentIds,
          mentioned_task_ids: taskIds,
        })
        .select('*')
        .single()

      if (error) throw error

      if (isEmailCmd) {
        const recipients = allMembers.filter(m => userIds.has(m.id)).map(m => m.email)
        await sendEmail({
          to: recipients,
          subject: `Message from ${profile.full_name} in #${channel.name || 'chat'}`,
          text: bodyForEmail,
        })
      } else if (channel.type === 'announcement') {
        await sendEmail({
          to: channelMembers.map(m => m.email),
          subject: `📢 ${channel.name || 'Announcement'}`,
          text: trimmed,
        })
      }

      setText('')
      setMentions([])
      onSent?.(msg)
    } finally {
      setSending(false)
    }
  }

  if (disabled) {
    return (
      <div className="px-4 py-3 border-t border-gray-800 text-xs text-gray-500 flex items-center gap-2">
        <AtSign size={13} /> {disabledReason ?? 'You cannot post in this channel.'}
      </div>
    )
  }

  return (
    <div className="relative border-t border-gray-800 p-3">
      {popover && popover.results.length > 0 && (
        <div className="absolute bottom-full left-3 mb-2 w-72 max-h-64 overflow-y-auto bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-1.5 z-20">
          {popover.results.map((r, i) => (
            <button
              key={`${r.type}-${r.id}-${i}`}
              onClick={() => pickResult(r)}
              className="w-full flex items-center justify-between gap-2 text-left text-xs px-2.5 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <span className="text-gray-200 truncate">@{r.label}</span>
              <span className={`badge text-[10px] flex-shrink-0 ${TYPE_TAG[r.type] ?? 'bg-gray-800 text-gray-400'}`}>{r.sub}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={taRef}
          className="input resize-none flex-1 py-2"
          rows={2}
          placeholder="Message... use @ to mention people, segments, deliverables, or tasks. Try /email @name to also send an email."
          value={text}
          onChange={handleChange}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !popover) {
              e.preventDefault()
              handleSend()
            }
            if (e.key === 'Escape') setPopover(null)
          }}
        />
        <button
          onClick={handleSend}
          disabled={sending || !text.trim()}
          className="btn-primary flex items-center gap-1.5 px-3 py-2 h-fit disabled:opacity-50"
          title={/^\/email\b/i.test(text.trim()) ? 'Sends chat message + email' : 'Send'}
        >
          {/^\/email\b/i.test(text.trim()) ? <Mail size={15} /> : <Send size={15} />}
        </button>
      </div>
    </div>
  )
}
