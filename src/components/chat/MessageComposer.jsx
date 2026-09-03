import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { sendEmail } from '../../lib/chat'
import EmailComposerPanel from './EmailComposerPanel'
import { Send, AtSign, Plus, Check, ListChecks } from 'lucide-react'

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
    .slice(0, 8)
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
    .forEach(t => results.push({ type: 'subtask', id: t.id, label: t.title, sub: 'Deliverable', segment_id: t.segment_id }))

  ;[...tasks]
    .filter(t => t.title?.toLowerCase().includes(q))
    .sort((a, b) => Number(!a.assignee_ids?.includes(profileId)) - Number(!b.assignee_ids?.includes(profileId)))
    .slice(0, 4)
    .forEach(t => results.push({ type: 'task', id: t.id, label: t.title, sub: 'Task' }))

  return results.slice(0, 16)
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
  const [multiMode, setMultiMode] = useState(false)
  const [multiSelected, setMultiSelected] = useState([]) // [{type:'user', id, label}]
  const [sending, setSending] = useState(false)
  const [showEmailPanel, setShowEmailPanel] = useState(false)
  const taRef = useRef(null)

  const channelMemberIds = new Set(channelMembers.map(m => m.id))

  function closePopover() {
    setPopover(null)
    setMultiMode(false)
    setMultiSelected([])
  }

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
      closePopover()
    }
  }

  function insertMentions(list) {
    if (!popover || list.length === 0) return
    const before = text.slice(0, popover.start)
    const after = text.slice(popover.end)
    const insertion = list.map(l => `@${l.label}`).join(' ') + ' '
    const nextText = `${before}${insertion}${after}`
    setText(nextText)
    setMentions(m => {
      const next = [...m]
      for (const r of list) {
        const key = `${r.type}:${r.id}`
        if (!next.some(x => `${x.type}:${x.id}` === key)) next.push(r)
      }
      return next
    })
    closePopover()
    requestAnimationFrame(() => {
      const pos = before.length + insertion.length
      taRef.current?.focus()
      taRef.current?.setSelectionRange(pos, pos)
    })
  }

  function pickResult(result) {
    if (result.type === 'user' && multiMode) {
      setMultiSelected(sel => {
        const key = `${result.type}:${result.id}`
        return sel.some(x => `${x.type}:${x.id}` === key)
          ? sel.filter(x => `${x.type}:${x.id}` !== key)
          : [...sel, result]
      })
      return
    }
    insertMentions([result])
  }

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || sending || disabled) return
    setSending(true)

    try {
      const present = mentions.filter(m => text.includes(`@${m.label}`))
      const userIds = new Set(present.filter(m => m.type === 'user').map(m => m.id))
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
          mentions: present,
          mentioned_user_ids: [...userIds],
          mentioned_segment_ids: [...new Set(present.filter(m => m.type === 'segment').map(m => m.id))],
          mentioned_task_ids: [...new Set(present.filter(m => m.type === 'task' || m.type === 'subtask').map(m => m.id))],
        })
        .select('*')
        .single()

      if (error) throw error

      if (channel.type === 'announcement') {
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

  async function handleSendEmail({ subject, body, recipients }) {
    const { data: msg, error } = await supabase
      .from('messages')
      .insert({
        channel_id: channel.id,
        sender_id: profile.id,
        body,
        mentions: recipients.map(r => ({ type: 'user', id: r.id, label: r.full_name })),
        mentioned_user_ids: recipients.map(r => r.id),
        email_subject: subject,
        email_to: recipients.map(r => ({ id: r.id, label: r.full_name, email: r.email })),
      })
      .select('*')
      .single()

    if (!error) {
      await sendEmail({ to: recipients.map(r => r.email), subject, text: body })
      onSent?.(msg)
    }
    setShowEmailPanel(false)
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
      {showEmailPanel && (
        <EmailComposerPanel
          channelMembers={channelMembers}
          onSend={handleSendEmail}
          onCancel={() => setShowEmailPanel(false)}
        />
      )}

      {popover && popover.results.length > 0 && (
        <div className="absolute bottom-full left-3 mb-2 w-80 max-h-72 overflow-y-auto bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-1.5 z-20">
          <div className="flex items-center justify-between px-1.5 py-1 mb-1 border-b border-gray-800">
            <button
              type="button"
              onClick={() => { setMultiMode(m => !m); setMultiSelected([]) }}
              className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md transition-colors ${multiMode ? 'bg-brand-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <ListChecks size={12} /> Select multiple
            </button>
            {multiMode && multiSelected.length > 0 && (
              <button
                type="button"
                onClick={() => insertMentions(multiSelected)}
                className="text-[11px] font-medium text-brand-400 hover:text-brand-300 px-2 py-1"
              >
                Add {multiSelected.length} →
              </button>
            )}
          </div>
          {popover.results.map((r, i) => {
            const isChecked = multiMode && r.type === 'user' && multiSelected.some(x => x.type === r.type && x.id === r.id)
            return (
              <button
                key={`${r.type}-${r.id}-${i}`}
                onClick={() => pickResult(r)}
                className="w-full flex items-center justify-between gap-2 text-left text-xs px-2.5 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
              >
                <span className="flex items-center gap-2 text-gray-200 truncate">
                  {multiMode && r.type === 'user' && (
                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${isChecked ? 'bg-brand-500 border-brand-500' : 'border-gray-600'}`}>
                      {isChecked && <Check size={10} className="text-white" />}
                    </span>
                  )}
                  @{r.label}
                </span>
                <span className={`badge text-[10px] flex-shrink-0 ${TYPE_TAG[r.type] ?? 'bg-gray-800 text-gray-400'}`}>{r.sub}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          onClick={() => setShowEmailPanel(s => !s)}
          title="Compose a structured email"
          className={`p-2 rounded-lg transition-colors flex-shrink-0 ${showEmailPanel ? 'bg-brand-600 text-white' : 'text-gray-500 hover:text-gray-200 hover:bg-gray-800'}`}
        >
          <Plus size={16} />
        </button>
        <textarea
          ref={taRef}
          className="input resize-none flex-1 py-2"
          rows={2}
          placeholder="Message... use @ to mention people, segments, deliverables, or tasks."
          value={text}
          onChange={handleChange}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !popover) {
              e.preventDefault()
              handleSend()
            }
            if (e.key === 'Escape') closePopover()
          }}
        />
        <button
          onClick={handleSend}
          disabled={sending || !text.trim()}
          className="btn-primary flex items-center gap-1.5 px-3 py-2 h-fit disabled:opacity-50"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  )
}
