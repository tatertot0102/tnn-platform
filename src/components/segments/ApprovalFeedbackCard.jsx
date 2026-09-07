import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { MessageSquareQuote, CheckCircle2, RotateCcw, ExternalLink } from 'lucide-react'

// The feedback widget. Same visual family as the email card in chat: a tinted,
// bordered block with a small uppercase header, used both inline on the
// approval gate and as a message card in the segment's channel.
const KINDS = {
  comment: {
    label: 'Feedback', icon: MessageSquareQuote,
    frame: 'border-amber-800/50 bg-amber-950/20', accent: 'text-amber-300',
  },
  approved: {
    label: 'Approved', icon: CheckCircle2,
    frame: 'border-green-800/50 bg-green-950/20', accent: 'text-green-300',
  },
  changes_requested: {
    label: 'Changes requested', icon: RotateCcw,
    frame: 'border-red-800/50 bg-red-950/20', accent: 'text-red-300',
  },
}

export default function ApprovalFeedbackCard({
  kind = 'comment', gateTitle, segmentTitle, authorName, body, createdAt, href,
}) {
  const style = KINDS[kind] ?? KINDS.comment
  const Icon = style.icon

  return (
    <div className={`border rounded-xl p-3 max-w-lg ${style.frame}`}>
      <p className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider mb-2 ${style.accent}`}>
        <Icon size={12} className="flex-shrink-0" />
        <span className="truncate">{style.label} · {gateTitle}</span>
      </p>

      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {authorName && <span className="badge bg-gray-800 text-gray-300 text-[10px]">{authorName}</span>}
        {segmentTitle && <span className="badge bg-purple-900 text-purple-300 text-[10px]">{segmentTitle}</span>}
        {createdAt && (
          <span className="text-[10px] text-gray-600">{format(new Date(createdAt), 'MMM d, h:mm a')}</span>
        )}
      </div>

      <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">{body}</p>

      {href && (
        <Link to={href} className="mt-2 inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors">
          Open approval gate <ExternalLink size={11} />
        </Link>
      )}
    </div>
  )
}
