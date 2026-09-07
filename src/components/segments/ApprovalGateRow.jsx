import { format, isBefore, isToday } from 'date-fns'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVertical, ShieldCheck, Check, X, MessageSquare, Trash2, Pencil,
} from 'lucide-react'

const STATUS = {
  pending:           { box: 'border-amber-600 bg-amber-950/40 text-amber-400', row: 'bg-amber-950/10' },
  approved:          { box: 'border-green-600 bg-green-600 text-white',        row: 'bg-green-950/10' },
  changes_requested: { box: 'border-red-600 bg-red-950/40 text-red-400',       row: 'bg-red-950/10' },
}

// An approval gate rendered as a row the same shape as a subtask, draggable in
// the same list. Everything below a gate stays blocked until it is approved.
export default function ApprovalGateRow({
  gate, members, profileId, isExec, canEdit, feedbackCount,
  onApprove, onRequestChanges, onComments, onEdit, onDelete, highlighted,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: gate.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }

  const status   = STATUS[gate.status] ?? STATUS.pending
  const approver = members.find(m => m.id === gate.approver_id)
  const canDecide = gate.approver_id === profileId || isExec
  const overdue = gate.due_date && gate.status !== 'approved'
    && isBefore(new Date(gate.due_date), new Date()) && !isToday(new Date(gate.due_date))

  return (
    <div ref={setNodeRef} style={style} id={`gate-${gate.id}`}
      className={`flex items-center gap-2 group py-1.5 px-2 -mx-2 border-b border-gray-800/40 last:border-0 rounded-lg transition-colors ${status.row} ${highlighted ? 'ring-1 ring-brand-500/60' : ''}`}>
      <div {...attributes} {...listeners} className="cursor-grab text-gray-700 hover:text-gray-400 flex-shrink-0 touch-none">
        <GripVertical size={14} />
      </div>

      <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${status.box}`}>
        {gate.status === 'approved' ? <Check size={11} />
          : gate.status === 'changes_requested' ? <X size={11} />
          : <ShieldCheck size={11} />}
      </div>

      <span className="flex-1 text-sm min-w-0 truncate text-gray-100 font-medium"
        title={gate.description || gate.title}>
        {gate.title}
        {canEdit && (
          <button onClick={() => onEdit(gate)}
            className="ml-1.5 text-gray-700 hover:text-brand-400 opacity-0 group-hover:opacity-100 transition-opacity align-middle">
            <Pencil size={11} />
          </button>
        )}
      </span>

      <button onClick={() => onComments(gate)}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-400 flex-shrink-0 transition-colors"
        title="Comments">
        <MessageSquare size={12} /> {feedbackCount > 0 ? feedbackCount : ''}
      </button>

      {canDecide && gate.status !== 'approved' && (
        <button onClick={() => onApprove(gate)} title="Approve"
          className="text-green-500 hover:text-green-400 flex-shrink-0 transition-colors">
          <Check size={15} />
        </button>
      )}
      {canDecide && gate.status !== 'changes_requested' && (
        <button onClick={() => onRequestChanges(gate)} title="Request changes"
          className="text-red-500 hover:text-red-400 flex-shrink-0 transition-colors">
          <X size={15} />
        </button>
      )}

      <span className={`text-xs w-32 flex-shrink-0 text-center ${overdue ? 'text-red-400' : 'text-gray-600'}`}>
        {gate.due_date ? format(new Date(gate.due_date), 'MM/dd/yyyy') : '—'}
      </span>

      <div className="w-56 flex-shrink-0 min-w-0">
        <span className="text-xs bg-gray-800 text-gray-300 border border-gray-700 rounded-full px-2 py-0.5 truncate inline-block max-w-full"
          title={approver?.full_name}>
          {approver ? `Approver: ${approver.full_name.split(' ')[0]}` : 'No approver'}
        </span>
      </div>

      {isExec && (
        <button onClick={() => onDelete(gate.id)}
          className="text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0">
          <Trash2 size={13} />
        </button>
      )}
    </div>
  )
}
