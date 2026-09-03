import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'
import ErrorState from '../ui/ErrorState'
import PeopleDropdown from '../ui/PeopleDropdown'
import { useToast } from '../../context/ToastContext'
import { Send } from 'lucide-react'

export default function SlackReminderModal({ open, onClose }) {
  const toast = useToast()
  const [segments, setSegments] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [selectedSegment, setSelectedSegment] = useState('')
  const [selectedMembers, setSelectedMembers] = useState([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!open) return
    fetchAll()
  }, [open])

  function fetchAll() {
    setLoading(true)
    setLoadError(false)
    Promise.all([
      supabase.from('segments').select('id, title, segment_roles(user_id)').neq('status', 'done').order('due_date'),
      supabase.from('profiles').select('id, full_name, slack_user_id').order('full_name'),
    ]).then(([{ data: segs, error: segError }, { data: mems, error: memError }]) => {
      if (segError || memError) { setLoadError(true); setLoading(false); return }
      setSegments(segs ?? [])
      setMembers(mems ?? [])
      setLoading(false)
    })
  }

  function handleSegmentChange(segId) {
    setSelectedSegment(segId)
    const seg = segments.find(s => s.id === segId)
    setSelectedMembers(segId ? (seg?.segment_roles?.map(r => r.user_id) ?? []) : [])
  }

  async function handleSend() {
    if (!message.trim() || selectedMembers.length === 0) return
    const targets = members.filter(m => selectedMembers.includes(m.id) && m.slack_user_id)
    if (targets.length === 0) { setError('None of the selected members have a Slack ID set up.'); return }

    setSending(true)
    setError('')
    const seg = segments.find(s => s.id === selectedSegment)

    const results = await Promise.allSettled(targets.map(member =>
      supabase.functions.invoke('slack-notify', {
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
    ))

    setSending(false)
    const failed = results.filter(r => r.status === 'rejected').length
    if (failed > 0) {
      setError(`Sent to ${targets.length - failed}/${targets.length}.`)
      toast.error(`Some reminders failed to send (${failed}/${targets.length}).`)
    } else {
      setSent(true)
      toast.success('Reminder sent.')
      setTimeout(() => { setSent(false); setMessage(''); onClose() }, 1200)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Send Slack Reminder" size="sm">
      {loading ? <div className="flex justify-center py-8"><Spinner size={6} /></div> : loadError ? (
        <ErrorState message="Could not load segments or members." onRetry={fetchAll} />
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Segment (optional)</label>
            <select className="input" value={selectedSegment} onChange={e => handleSegmentChange(e.target.value)}>
              <option value="">Pick people manually...</option>
              {segments.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Recipients</label>
            <PeopleDropdown
              options={members.map(m => ({ id: m.id, label: m.full_name, sublabel: m.slack_user_id ? undefined : 'no Slack' }))}
              selectedIds={selectedMembers}
              onChange={setSelectedMembers}
              placeholder="Search people..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Message</label>
            <textarea className="input resize-none" rows={3} value={message} onChange={e => setMessage(e.target.value)} placeholder="Type your reminder..." />
          </div>

          {error && <p className="text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-900/40 rounded-lg px-3 py-2">{error}</p>}

          <button
            onClick={handleSend}
            disabled={sending || !message.trim() || selectedMembers.length === 0}
            className="btn-primary flex items-center justify-center gap-2 w-full"
          >
            {sending ? <Spinner size={4} /> : sent ? '✓ Sent!' : <><Send size={14} /> Send</>}
          </button>
        </div>
      )}
    </Modal>
  )
}
