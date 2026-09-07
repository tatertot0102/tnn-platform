import { useState } from 'react'
import { format, isBefore, isToday } from 'date-fns'
import {
  ShieldCheck, CheckCircle2, RotateCcw, Clock, CalendarDays, Trash2, Pencil,
  MessageSquarePlus, ChevronDown, ChevronRight, Flag,
} from 'lucide-react'
import ApprovalFeedbackCard from './ApprovalFeedbackCard'

const STATUS = {
  pending:           { label: 'Awaiting approval', className: 'bg-amber-900/60 text-amber-300', icon: Clock,        frame: 'border-amber-800/40' },
  approved:          { label: 'Approved',          className: 'bg-green-900/60 text-green-300', icon: CheckCircle2, frame: 'border-green-800/50 bg-green-950/10' },
  changes_requested: { label: 'Changes requested', className: 'bg-red-900/60 text-red-300',     icon: RotateCcw,    frame: 'border-red-800/50 bg-red-950/10' },
}

export default function ApprovalGateCard({
  gate, feedback, members, profileId, isExec, segmentTitle, milestoneTitle,
  onDecide, onFeedback, onEdit, onDelete, highlighted,
}) {
  const [open, setOpen] = useState(true)
  const status   = STATUS[gate.status] ?? STATUS.pending
  const Icon     = status.icon
  const approver = members.find(m => m.id === gate.approver_id)
  const isApprover = gate.approver_id === profileId
  const canDecide  = isApprover || isExec
  const overdue = gate.due_date && gate.status === 'pending'
    && isBefore(new Date(gate.due_date), new Date()) && !isToday(new Date(gate.due_date))

  return (
    <div id={`gate-${gate.id}`}
      className={`border rounded-xl mb-3 transition-all ${status.frame} ${highlighted ? 'ring-1 ring-brand-500/60' : ''}`}>
      <div className="flex items-start gap-2 px-4 py-3">
        <button onClick={() => setOpen(o => !o)} className="text-gray-500 hover:text-gray-300 flex-shrink-0 mt-0.5">
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <ShieldCheck size={14} className="text-brand-400 flex-shrink-0 mt-0.5" />

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-100">{gate.title}</span>
            <span className={`badge text-[10px] flex items-center gap-1 ${status.className}`}>
              <Icon size={10} /> {status.label}
            </span>
            {milestoneTitle && (
              <span className="badge bg-gray-800 text-gray-400 text-[10px] flex items-center gap-1">
                <Flag size={9} /> {milestoneTitle}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-500">
            <span>Approver: <span className="text-gray-300">{approver?.full_name ?? 'Unassigned'}</span></span>
            {gate.due_date && (
              <span className={`flex items-center gap-1 ${overdue ? 'text-red-400' : ''}`}>
                <CalendarDays size={11} /> {format(new Date(gate.due_date), 'MMM d, yyyy')}{overdue ? ' · overdue' : ''}
              </span>
            )}
            {feedback.length > 0 && <span>{feedback.length} feedback note{feedback.length > 1 ? 's' : ''}</span>}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {isExec && (
            <>
              <button onClick={() => onEdit(gate)} className="text-gray-600 hover:text-brand-400 transition-colors p-1" title="Edit gate">
                <Pencil size={13} />
              </button>
              <button onClick={() => onDelete(gate.id)} className="text-gray-700 hover:text-red-400 transition-colors p-1" title="Delete gate">
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 pl-11 space-y-3">
          {gate.description && (
            <p className="text-sm text-gray-400 whitespace-pre-wrap leading-relaxed">{gate.description}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <button onClick={() => onFeedback(gate, 'comment')}
              className="btn-ghost text-xs px-3 py-1.5 border border-gray-700 flex items-center gap-1.5">
              <MessageSquarePlus size={13} /> Add Feedback
            </button>
            {canDecide && gate.status !== 'approved' && (
              <button onClick={() => onDecide(gate, 'approved')}
                className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
                <CheckCircle2 size={13} /> Approve
              </button>
            )}
            {canDecide && gate.status !== 'changes_requested' && (
              <button onClick={() => onDecide(gate, 'changes_requested')}
                className="btn-ghost text-xs px-3 py-1.5 border border-red-900/60 text-red-300 flex items-center gap-1.5">
                <RotateCcw size={13} /> Request Changes
              </button>
            )}
          </div>

          {feedback.length > 0 && (
            <div className="space-y-2 pt-1">
              {feedback.map(f => (
                <ApprovalFeedbackCard key={f.id} kind={f.kind} gateTitle={gate.title}
                  segmentTitle={segmentTitle} body={f.body} createdAt={f.created_at}
                  authorName={members.find(m => m.id === f.author_id)?.full_name} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
