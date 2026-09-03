import { useState } from 'react'
import { Mail, X, Send, Check } from 'lucide-react'
import Spinner from '../ui/Spinner'

export default function EmailComposerPanel({ channelMembers, onSend, onCancel }) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [recipientIds, setRecipientIds] = useState(channelMembers.map(m => m.id))
  const [sending, setSending] = useState(false)

  function toggleRecipient(id) {
    setRecipientIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  }

  async function handleSend() {
    if (!subject.trim() || !body.trim() || recipientIds.length === 0 || sending) return
    setSending(true)
    await onSend({
      subject: subject.trim(),
      body: body.trim(),
      recipients: channelMembers.filter(m => recipientIds.includes(m.id)),
    })
    setSending(false)
  }

  return (
    <div className="border border-brand-700/50 bg-brand-950/20 rounded-xl p-3 mb-2">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-brand-300 uppercase tracking-wider flex items-center gap-1.5">
          <Mail size={13} /> New Email
        </p>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-300">
          <X size={15} />
        </button>
      </div>

      <div className="space-y-2.5">
        <input
          className="input text-sm"
          placeholder="Subject..."
          value={subject}
          onChange={e => setSubject(e.target.value)}
          autoFocus
        />

        <div>
          <p className="text-[11px] text-gray-500 mb-1.5">Recipients ({recipientIds.length})</p>
          <div className="flex flex-wrap gap-1.5 p-2 bg-gray-800 rounded-lg max-h-28 overflow-y-auto">
            {channelMembers.map(m => {
              const checked = recipientIds.includes(m.id)
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleRecipient(m.id)}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${checked ? 'bg-brand-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-gray-200'}`}
                >
                  {checked && <Check size={11} />} {m.full_name}
                </button>
              )
            })}
          </div>
        </div>

        <textarea
          className="input resize-none text-sm"
          rows={3}
          placeholder="Email body..."
          value={body}
          onChange={e => setBody(e.target.value)}
        />

        <div className="flex justify-end gap-2 pt-0.5">
          <button onClick={onCancel} className="btn-ghost text-xs px-3 py-1.5">Cancel</button>
          <button
            onClick={handleSend}
            disabled={sending || !subject.trim() || !body.trim() || recipientIds.length === 0}
            className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50"
          >
            {sending ? <Spinner size={4} /> : <Send size={12} />} Send Email
          </button>
        </div>
      </div>
    </div>
  )
}
