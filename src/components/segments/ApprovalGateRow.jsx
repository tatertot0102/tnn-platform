import { format } from 'date-fns'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ShieldCheck, Check, X, MessageSquare, Trash2, Pencil, CalendarDays } from 'lucide-react'
import DragHandle from './subtasks/DragHandle'
import { gateApprovers, isOverdue } from '../../lib/subtasks'

const STATUS = {
  pending:           { box: 'border-amber-600 bg-amber-950/40 text-amber-400', row: 'bg-amber-950/10', label: 'Awaiting approval' },
  approved:          { box: 'border-green-600 bg-green-600 text-white',        row: 'bg-green-950/10', label: 'Approved' },
  changes_requested: { box: 'border-red-600 bg-red-950/40 text-red-400',       row: 'bg-red-950/10',   label: 'Changes requested' },
}

const DOT = { pending: 'bg-amber-400', approved: 'bg-green-500', changes_requested: 'bg-red-500' }
const DECISION = { pending: 'waiting', approved: 'approved', changes_requested: 'requested changes' }

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}

/** Overlapping avatars, each with a dot showing that approver's decision. */
export function ApproverStack({ approvers, members, max = 4 }) {
  const shown = approvers.slice(0, max)
  const approved = approvers.filter(a => a.status === 'approved').length
  const summary = approvers
    .map(a => `${members.find(m => m.id === a.user_id)?.full_name ?? 'Unknown'}: ${DECISION[a.status]}`)
    .join(', ')

  if (!approvers.length) return <span className="text-xs text-gray-600 italic">No approvers</span>

  return (
    <span className="flex items-center gap-2 min-w-0" title={summary}>
      <span className="flex -space-x-1.5" aria-hidden="true">
        {shown.map(a => {
          const name = members.find(m => m.id === a.user_id)?.full_name ?? ''
          return (
            <span key={a.user_id}
              className="relative w-6 h-6 rounded-full bg-gray-700 border-2 border-gray-900 text-[10px] font-semibold text-gray-200 flex items-center justify-center">
              {initials(name)}
              <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-900 ${DOT[a.status]}`} />
            </span>
          )
        })}
        {approvers.length > max && (
          <span className="w-6 h-6 rounded-full bg-gray-800 border-2 border-gray-900 text-[10px] text-gray-400 flex items-center justify-center">
            +{approvers.length - max}
          </span>
        )}
      </span>
      <span className="text-xs text-gray-400 whitespace-nowrap">
        <span className="sr-only">{summary}. </span>{approved}/{approvers.length} approved
      </span>
    </span>
  )
}

// An approval gate rendered in the same list as subtasks. Everything below it
// stays blocked until every approver has approved.
export default function ApprovalGateRow({
  gate, members, profileId, isExec, canEdit, isDesktop = true, dragDisabled, highlighted,
  onApprove, onRequestChanges, onComments, onEdit, onDelete,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: gate.id, disabled: dragDisabled })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }

  const status   = STATUS[gate.status] ?? STATUS.pending
  const approvers = gateApprovers(gate)
  const mine     = approvers.find(a => a.user_id === profileId)
  const canDecide = !!mine
  const overdue  = gate.status !== 'approved' && isOverdue(gate.due_date, false)
  const feedbackCount = gate.approval_feedback?.length ?? 0

  const decisionButtons = canDecide && (
    <span className="flex items-center gap-1 flex-shrink-0">
      {mine.status !== 'approved' && (
        <button type="button" onClick={() => onApprove(gate)} aria-label={`Approve "${gate.title}"`}
          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-green-600/15 text-green-400 hover:bg-green-600/25 active:scale-95 transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400">
          <Check size={13} aria-hidden="true" /> Approve
        </button>
      )}
      {mine.status !== 'changes_requested' && (
        <button type="button" onClick={() => onRequestChanges(gate)} aria-label={`Request changes on "${gate.title}"`}
          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-red-600/10 text-red-400 hover:bg-red-600/20 active:scale-95 transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
          <X size={13} aria-hidden="true" /> {isDesktop ? 'Changes' : 'Request changes'}
        </button>
      )}
    </span>
  )

  const commentsButton = (
    <button type="button" onClick={() => onComments(gate)} aria-label={`Comments on "${gate.title}" (${feedbackCount})`}
      className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-400 flex-shrink-0 transition-colors duration-fast p-1.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
      <MessageSquare size={13} aria-hidden="true" /> {feedbackCount > 0 ? feedbackCount : ''}
    </button>
  )

  const statusBox = (
    <span role="img" aria-label={status.label} title={status.label}
      className={`w-6 h-6 md:w-5 md:h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${status.box}`}>
      {gate.status === 'approved' ? <Check size={11} />
        : gate.status === 'changes_requested' ? <X size={11} />
        : <ShieldCheck size={11} />}
    </span>
  )

  const rowClass = `group border-b border-gray-800/40 last:border-0 rounded-lg transition-colors duration-fast ${status.row} ${highlighted ? 'ring-1 ring-brand-400/60' : ''}`
  const dueLabel = gate.due_date ? format(new Date(`${gate.due_date}T00:00:00`), isDesktop ? 'MM/dd/yyyy' : 'MMM d') : null

  if (!isDesktop) {
    return (
      <div ref={setNodeRef} style={style} id={`gate-${gate.id}`} className={`${rowClass} px-2 -mx-2 py-3`}>
        <div className="flex items-start gap-2">
          <DragHandle attributes={attributes} listeners={listeners} disabled={dragDisabled || !canEdit}
            label={`Reorder approval gate "${gate.title}"`} />
          {statusBox}
          <button type="button" onClick={() => canEdit ? onEdit(gate) : onComments(gate)}
            className="flex-1 min-w-0 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
            <span className="block text-[15px] font-medium text-gray-100 leading-snug">{gate.title}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <ApproverStack approvers={approvers} members={members} max={3} />
              {dueLabel && (
                <span className={`inline-flex items-center gap-1 text-xs ${overdue ? 'text-red-400' : 'text-gray-500'}`}>
                  <CalendarDays size={11} aria-hidden="true" /> {dueLabel}
                </span>
              )}
            </span>
          </button>
          {commentsButton}
        </div>
        {decisionButtons && <div className="mt-2 pl-14 flex">{decisionButtons}</div>}
      </div>
    )
  }

  return (
    <div ref={setNodeRef} style={style} id={`gate-${gate.id}`} className={`${rowClass} flex items-center gap-2 py-1.5 px-2 -mx-2`}>
      <DragHandle attributes={attributes} listeners={listeners} disabled={dragDisabled || !canEdit}
        label={`Reorder approval gate "${gate.title}"`} />
      {statusBox}

      <span className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className="text-sm truncate text-gray-100 font-medium" title={gate.description || gate.title}>{gate.title}</span>
        {canEdit && (
          <button type="button" onClick={() => onEdit(gate)} aria-label={`Edit "${gate.title}"`}
            className="reveal-on-hover p-1 rounded text-gray-600 hover:text-brand-400 transition-opacity duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
            <Pencil size={11} aria-hidden="true" />
          </button>
        )}
      </span>

      {commentsButton}
      {decisionButtons}

      <span className={`text-xs w-36 flex-shrink-0 text-center ${overdue ? 'text-red-400' : 'text-gray-600'}`}>
        {dueLabel ?? '—'}
      </span>

      <div className="w-56 flex-shrink-0 min-w-0">
        <ApproverStack approvers={approvers} members={members} />
      </div>

      {isExec ? (
        <button type="button" onClick={() => onDelete(gate.id)} aria-label={`Delete "${gate.title}"`}
          className="reveal-on-hover p-1.5 rounded-md text-gray-600 hover:text-red-400 transition-opacity duration-fast flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
          <Trash2 size={13} aria-hidden="true" />
        </button>
      ) : <span className="w-7 flex-shrink-0" aria-hidden="true" />}
    </div>
  )
}
