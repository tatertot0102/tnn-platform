import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { ArrowLeft, Minimize2 } from 'lucide-react'
import { useSegmentWork } from '../hooks/useSegmentWork'
import SubtaskBoard from '../components/segments/subtasks/SubtaskBoard'
import { FILTERS } from '../lib/subtaskFilters'
import ErrorState from '../components/ui/ErrorState'
import { ListSkeleton, Skeleton } from '../components/ui/Skeleton'
import { isOverdue, gateApprovers } from '../lib/subtasks'

function ProgressHeader({ work }) {
  const { subtasks, gates, profileId } = work
  const done = subtasks.filter(t => t.completed).length
  const pct = subtasks.length ? done / subtasks.length : 0
  const overdue = subtasks.filter(t => isOverdue(t.due_date, t.completed)).length
  const awaitingMe = gates.filter(g =>
    gateApprovers(g).some(a => a.user_id === profileId && a.status !== 'approved')).length

  return (
    <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
      <div className="flex items-center gap-2 min-w-40 flex-1 max-w-xs">
        <div className="h-1.5 flex-1 bg-gray-800 rounded-full overflow-hidden" aria-hidden="true">
          <div className="h-full bg-brand-400 rounded-full origin-left transition-transform duration-normal ease-out-expo"
            style={{ transform: `scaleX(${pct})` }} />
        </div>
        <span className="tabular-nums">{done}/{subtasks.length} done</span>
      </div>
      {overdue > 0 && <span className="badge bg-red-900/60 text-red-300">{overdue} overdue</span>}
      {awaitingMe > 0 && <span className="badge bg-amber-900/60 text-amber-300">{awaitingMe} awaiting your approval</span>}
    </div>
  )
}

// Full-screen workspace for a segment's subtasks: everything the Subtasks tab
// has, using the whole window, with filters kept in the URL.
export default function SegmentSubtasks() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const work = useSegmentWork(id)
  const filter = FILTERS[searchParams.get('filter')] ? searchParams.get('filter') : 'all'

  function setFilter(next) {
    setSearchParams(params => {
      const updated = new URLSearchParams(params)
      if (next === 'all') updated.delete('filter')
      else updated.set('filter', next)
      return updated
    }, { replace: true })
  }

  if (work.isError) return <ErrorState message="Could not load these subtasks." onRetry={work.refetch} />
  if (!work.isLoading && !work.segment) return <p className="text-gray-400 p-6">Segment not found.</p>

  return (
    <div className="min-h-dvh">
      <header className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] md:top-0 z-20 -mx-4 md:-mx-8 -mt-4 md:-mt-8 px-4 md:px-8 pt-3 md:pt-6 pb-3 bg-gray-950/85 backdrop-blur-md border-b border-gray-800/80">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate(`/segments/${id}`)} aria-label="Back to segment"
            className="p-2 -ml-2 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">Subtasks</p>
            {work.segment
              ? <h1 className="text-lg md:text-xl font-bold text-white truncate">{work.segment.title}</h1>
              : <Skeleton className="h-6 w-48 mt-1" />}
          </div>
          <Link to={`/segments/${id}?tab=subtasks`} title="Exit full screen" aria-label="Exit full screen"
            className="hidden md:flex p-2 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
            <Minimize2 size={17} aria-hidden="true" />
          </Link>
        </div>

        {!work.isLoading && <div className="mt-2"><ProgressHeader work={work} /></div>}

        <div role="group" aria-label="Filter subtasks"
          className="mt-3 -mx-4 px-4 md:mx-0 md:px-0 flex gap-1.5 overflow-x-auto no-scrollbar">
          {Object.entries(FILTERS).map(([key, { label }]) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}
              className={`whitespace-nowrap text-xs font-medium px-3 py-1.5 rounded-full border transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${filter === key ? 'bg-brand-600 border-brand-600 text-white' : 'border-gray-700 text-gray-400 hover:text-gray-100 hover:border-gray-500'}`}>
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {work.isLoading
          ? <div className="card p-5"><ListSkeleton rows={8} /></div>
          : <SubtaskBoard work={work} filter={filter}
              highlightId={searchParams.get('highlight')} highlightGateId={searchParams.get('gate')} />}
      </div>
    </div>
  )
}
