import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/ui/PageHeader'
import Spinner from '../components/ui/Spinner'
import { Send, Bell } from 'lucide-react'

export default function Reminders() {
  const [segments, setSegments]   = useState([])
  const [members, setMembers]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [sending, setSending]     = useState(false)
  const [sent, setSent]           = useState(false)
  const [error, setError]         = useState('')

  // Form state
  const [mode, setMode]           = useState('segment') // 'segment' | 'manual'
  const [selectedSegment, setSelectedSegment] = useState('')
  const [selectedMembers, setSelectedMembers] = useState([])
  const [message, setMessage]     = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('segments').select('id, title, due_date, segment_roles(user_id, profiles(full_name, slack_user_id))').neq('status', 'done').order('due_date'),
      supabase.from('profiles').select('id, full_name, slack_user_id').order('full_name'),
    ]).then(([{ data: segs }, { data: mems }]) => {
      setSegments(segs ?? [])
      setMembers(mems ?? [])
      setLoading(false)
    })
  }, [])

  // When segment selected, auto-select its members
  function handleSegmentChange(segId) {
    setSelectedSegment(segId)
    if (segId) {
      const seg = segments.find(s => s.id === segId)
      const ids = seg?.segment_roles?.map(r => r.user_id) ?? []
      setSelectedMembers(ids)
    } else {
      setSelectedMembers([])
    }
  }

  function toggleMember(id) {
    setSelectedMembers(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function handleSend() {
    if (!message.trim()) { setError('Please enter a message'); return }
    if (selectedMembers.length === 0) { setError('Select at least one recipient'); return }

    const targets = members.filter(m => selectedMembers.includes(m.id) && m.slack_user_id)
    const noSlack = members.filter(m => selectedMembers.includes(m.id) && !m.slack_user_id)

    if (targets.length === 0) {
      setError('None of the selected members have a Slack ID set up. Ask them to add it in My Profile.')
      return
    }

    setSending(true)
    setError('')

    const seg = segments.find(s => s.id === selectedSegment)

    // Call the slack-notify edge function for each recipient
    const results = await Promise.allSettled(
      targets.map(async member => {
        const response = await supabase.functions.invoke('slack-notify', {
          body: {
            type: 'REMINDER',
            table: 'reminders',
            record: {
              slack_user_id: member.slack_user_id,
              message: message.trim(),
              segment_title: seg?.title ?? null,
              segment_id: selectedSegment || null,
            },
          },
        })

        if (response.error) {
          throw response.error
        }

        return response.data
      })
    )

    setSending(false)
    const failed = results.filter(r => r.status === 'rejected').length

    if (failed > 0) {
      setError(`Sent to ${targets.length - failed}/${targets.length}. ${failed} failed — check Edge Function logs.`)
    } else {
      setSent(true)
      if (noSlack.length > 0) {
        setError(`Sent to ${targets.length}. Note: ${noSlack.map(m => m.full_name).join(', ')} have no Slack ID set.`)
      }
      setTimeout(() => { setSent(false); setMessage('') }, 3000)
    }
  }

  if (loading) return <div className="flex justify-center py-24"><Spinner size={8} /></div>

  const selectedSeg = segments.find(s => s.id === selectedSegment)
  const recipientList = mode === 'segment'
    ? members.filter(m => selectedMembers.includes(m.id))
    : members.filter(m => selectedMembers.includes(m.id))

  return (
    <div>
      <PageHeader
        title="Send Reminders"
        subtitle="Send a Slack DM to segment members or specific people"
      />

      <div className="grid md:grid-cols-2 gap-6 max-w-4xl">
        {/* Left: targeting */}
        <div className="space-y-5">
          {/* Mode toggle */}
          <div className="card p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Target</p>
            <div className="flex gap-1 bg-gray-800 rounded-lg p-1 mb-4">
              {[['segment', 'By Segment'], ['manual', 'Pick People']].map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => { setMode(v); setSelectedMembers([]); setSelectedSegment('') }}
                  className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === v ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  {l}
                </button>
              ))}
            </div>

            {mode === 'segment' ? (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Segment</label>
                <select className="input" value={selectedSegment} onChange={e => handleSegmentChange(e.target.value)}>
                  <option value="">Select a segment...</option>
                  {segments.map(s => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
                {selectedSeg && (
                  <p className="text-xs text-gray-600 mt-1.5">
                    {selectedMembers.length} people on this segment
                  </p>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Select recipients</label>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {members.map(m => (
                    <label key={m.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-gray-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedMembers.includes(m.id)}
                        onChange={() => toggleMember(m.id)}
                        className="accent-brand-400"
                      />
                      <span className="text-sm text-gray-200">{m.full_name}</span>
                      {!m.slack_user_id && <span className="text-xs text-gray-600">no Slack</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Recipients preview */}
          {selectedMembers.length > 0 && (
            <div className="card p-4">
              <p className="text-xs font-medium text-gray-500 mb-2">Will notify ({selectedMembers.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {recipientList.map(m => (
                  <div key={m.id} className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${m.slack_user_id ? 'bg-brand-900 text-brand-300' : 'bg-gray-800 text-gray-500'}`}>
                    {m.full_name}
                    {!m.slack_user_id && ' ⚠'}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: message */}
        <div className="card p-5 flex flex-col gap-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Message</p>

          {/* Quick templates */}
          <div>
            <p className="text-xs text-gray-600 mb-2">Quick templates</p>
            <div className="space-y-1.5">
              {[
                selectedSeg ? `Reminder: "${selectedSeg.title}" is due soon. Please make sure your part is on track.` : null,
                'Please check TNN Platform for your latest assignments.',
                'Heads up — we have a deadline coming up. Make sure your tasks are complete.',
                'Team meeting reminder: check the platform for your current segment assignments.',
              ].filter(Boolean).map((t, i) => (
                <button
                  key={i}
                  onClick={() => setMessage(t)}
                  className="w-full text-left text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 px-3 py-2 rounded-lg transition-colors"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Custom message</label>
            <textarea
              className="input resize-none w-full"
              rows={5}
              placeholder="Type your reminder message..."
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-900/40 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            onClick={handleSend}
            disabled={sending || !message.trim() || selectedMembers.length === 0}
            className="btn-primary flex items-center justify-center gap-2 w-full"
          >
            {sending ? <Spinner size={4} /> : sent ? '✓ Sent!' : <><Send size={14} /> Send Reminder</>}
          </button>

          <p className="text-xs text-gray-700 text-center">
            Only sends to members with a Slack ID configured
          </p>
        </div>
      </div>
    </div>
  )
}
