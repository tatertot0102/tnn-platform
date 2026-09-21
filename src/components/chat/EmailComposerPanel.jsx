import { useMemo, useState } from 'react'
import { Mail, X, Send, AlertCircle, UserPlus } from 'lucide-react'
import Spinner from '../ui/Spinner'
import PeopleDropdown from '../ui/PeopleDropdown'

// Composes an email that is also posted into the channel as a message.
// Recipients default to the channel, but anyone on the platform can be added;
// people outside the channel are pulled in so they can see the thread.
export default function EmailComposerPanel({ channelMembers, allMembers, onSend, onCancel }) {
  const memberIds = useMemo(() => new Set(channelMembers.map(m => m.id)), [channelMembers])
  const [recipientIds, setRecipientIds] = useState(() => channelMembers.filter(m => m.email).map(m => m.id))
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  // Channel first, then the rest of the team — both searchable in one list.
  const options = useMemo(() => {
    const inChannel = allMembers.filter(m => memberIds.has(m.id))
    const others = allMembers.filter(m => !memberIds.has(m.id))
    const toOption = (m, group) => ({
      id: m.id,
      label: m.full_name ?? m.email ?? 'Unknown',
      sublabel: m.email ?? 'No email on file',
      group,
    })
    return [
      ...inChannel.map(m => toOption(m, 'In this channel')),
      ...others.map(m => toOption(m, 'Everyone else')),
    ]
  }, [allMembers, memberIds])

  const recipients = useMemo(
    () => recipientIds.map(id => allMembers.find(m => m.id === id)).filter(Boolean),
    [allMembers, recipientIds]
  )
  const missingEmail = recipients.filter(r => !r.email)
  const willJoin = recipients.filter(r => !memberIds.has(r.id))
  const canSend = subject.trim() && body.trim() && recipients.length > 0 && recipients.length > missingEmail.length

  async function handleSend() {
    if (!canSend || sending) return
    setSending(true)
    setError(null)
    const result = await onSend({ subject: subject.trim(), body: body.trim(), recipients })
    setSending(false)
    if (result?.error) setError(result.error)
  }

  return (
    <div className="border border-gray-700 bg-gray-900 rounded-xl mb-2 shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900/80 border-b border-gray-800">
        <p className="text-xs font-semibold text-brand-300 uppercase tracking-wider flex items-center gap-1.5">
          <Mail size={13} /> New email
        </p>
        <button onClick={onCancel} aria-label="Close email composer" className="text-gray-500 hover:text-gray-200 p-0.5">
          <X size={15} />
        </button>
      </div>

      <div
        className="p-3 space-y-2"
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSend() }
        }}
      >
        <div className="flex items-start gap-2">
          <span className="text-xs text-gray-500 w-14 pt-2.5 flex-shrink-0">To</span>
          <div className="flex-1 min-w-0">
            <PeopleDropdown
              options={options}
              selectedIds={recipientIds}
              onChange={setRecipientIds}
              placeholder="Add recipients..."
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-14 flex-shrink-0">Subject</span>
          <input
            className="input flex-1"
            placeholder="What is this about?"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            autoFocus
          />
        </div>

        <textarea
          className="input resize-none text-sm"
          rows={4}
          placeholder="Write your message..."
          value={body}
          onChange={e => setBody(e.target.value)}
        />

        {willJoin.length > 0 && (
          <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
            <UserPlus size={11} className="flex-shrink-0" />
            {willJoin.map(r => r.full_name).join(', ')} will be added to this channel.
          </p>
        )}
        {missingEmail.length > 0 && (
          <p className="text-[11px] text-amber-400 flex items-center gap-1.5">
            <AlertCircle size={11} className="flex-shrink-0" />
            No email on file for {missingEmail.map(r => r.full_name).join(', ')} — they will only get the message in chat.
          </p>
        )}
        {error && (
          <p className="text-[11px] text-red-400 flex items-start gap-1.5">
            <AlertCircle size={11} className="flex-shrink-0 mt-0.5" /> {error}
          </p>
        )}

        <div className="flex items-center justify-between pt-0.5">
          <span className="text-[11px] text-gray-600">
            {recipients.length} recipient{recipients.length !== 1 ? 's' : ''} · ⌘↵ to send
          </span>
          <div className="flex gap-2">
            <button onClick={onCancel} className="btn-ghost text-xs px-3 py-1.5">Cancel</button>
            <button
              onClick={handleSend}
              disabled={sending || !canSend}
              className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50"
            >
              {sending ? <Spinner size={4} /> : <Send size={12} />} Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
