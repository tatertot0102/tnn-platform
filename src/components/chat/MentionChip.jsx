import { useNavigate } from 'react-router-dom'
import { User, Film, ListChecks, CheckSquare, Megaphone } from 'lucide-react'

const TYPE_STYLE = {
  user:      { icon: User,        className: 'bg-brand-900/60 text-brand-300 hover:bg-brand-900' },
  segment:   { icon: Film,        className: 'bg-purple-900/60 text-purple-300 hover:bg-purple-900' },
  subtask:   { icon: ListChecks,  className: 'bg-indigo-900/60 text-indigo-300 hover:bg-indigo-900' },
  task:      { icon: CheckSquare, className: 'bg-teal-900/60 text-teal-300 hover:bg-teal-900' },
  everyone:  { icon: Megaphone,   className: 'bg-red-900/60 text-red-300 hover:bg-red-900' },
}

// mention: { type, id, label, segment_id? } — segment_id is set on subtask
// mentions so we know which segment page to deep-link into.
export default function MentionChip({ mention }) {
  const navigate = useNavigate()
  const style = TYPE_STYLE[mention.type] ?? TYPE_STYLE.user
  const Icon = style.icon

  function handleClick() {
    if (mention.type === 'segment') navigate(`/segments/${mention.id}`)
    else if (mention.type === 'subtask') navigate(`/segments/${mention.segment_id}?tab=subtasks&highlight=${mention.id}`)
    else if (mention.type === 'task') navigate(`/tasks?highlight=${mention.id}`)
    else if (mention.type === 'user') navigate('/members')
    // 'everyone' has nowhere to go
  }

  const clickable = mention.type !== 'everyone'

  return (
    <button
      type="button"
      onClick={clickable ? handleClick : undefined}
      disabled={!clickable}
      className={`inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded-md text-[13px] font-medium align-baseline transition-colors ${style.className} ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <Icon size={11} />@{mention.label}
    </button>
  )
}
