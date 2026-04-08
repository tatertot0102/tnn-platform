import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { PriorityBadge, StatusBadge } from '../components/ui/Badge'
import PageHeader from '../components/ui/PageHeader'
import Spinner from '../components/ui/Spinner'
import { format, differenceInDays, parseISO, isValid } from 'date-fns'
import { STATUSES } from '../lib/constants'

function GanttView({ segments }) {
  if (!segments.length) return <p className="text-gray-500 text-sm">No segments with dates.</p>

  const dated = segments.filter(s => s.start_date && s.due_date)
  if (!dated.length) return <p className="text-gray-500 text-sm">Add start and due dates to segments to see the Gantt chart.</p>

  const minDate = new Date(Math.min(...dated.map(s => new Date(s.start_date))))
  const maxDate = new Date(Math.max(...dated.map(s => new Date(s.due_date))))
  const totalDays = Math.max(differenceInDays(maxDate, minDate) + 1, 1)

  const statusColors = {
    'not-started': 'bg-gray-600',
    'in-progress':  'bg-brand-600',
    'blocked':      'bg-red-600',
    'done':         'bg-green-600',
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px]">
        <div className="flex items-center mb-2 pl-40">
          <span className="text-xs text-gray-500">{format(minDate, 'MMM d')}</span>
          <div className="flex-1" />
          <span className="text-xs text-gray-500">{format(maxDate, 'MMM d')}</span>
        </div>
        <div className="space-y-2">
          {dated.map(seg => {
            const start = differenceInDays(new Date(seg.start_date), minDate)
            const duration = Math.max(differenceInDays(new Date(seg.due_date), new Date(seg.start_date)) + 1, 1)
            const left = (start / totalDays) * 100
            const width = Math.max((duration / totalDays) * 100, 2)
            return (
              <div key={seg.id} className="flex items-center gap-3">
                <span className="text-sm text-gray-300 w-36 flex-shrink-0 truncate" title={seg.title}>{seg.title}</span>
                <div className="flex-1 relative h-8 bg-gray-800 rounded">
                  <div
                    className={`absolute top-1 bottom-1 rounded ${statusColors[seg.status] ?? 'bg-gray-600'} flex items-center px-2`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  >
                    <span className="text-xs text-white truncate font-medium">{seg.title}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex gap-4 mt-6 flex-wrap">
          {Object.entries(statusColors).map(([s, c]) => (
            <div key={s} className="flex items-center gap-1.5 text-xs text-gray-400">
              <div className={`w-3 h-3 rounded ${c}`} />
              {STATUSES[s]?.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TileView({ segments, navigate }) {
  const columns = ['not-started', 'in-progress', 'blocked', 'done']
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {columns.map(status => {
        const col = segments.filter(s => s.status === status)
        return (
          <div key={status} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{STATUSES[status]?.label}</p>
              <span className="badge bg-gray-800 text-gray-500 text-xs">{col.length}</span>
            </div>
            <div className="space-y-2">
              {col.map(seg => (
                <div
                  key={seg.id}
                  onClick={() => navigate(`/segments/${seg.id}`)}
                  className="bg-gray-800 rounded-lg p-3 cursor-pointer hover:bg-gray-700 transition-colors"
                >
                  <p className="text-sm font-medium text-gray-100 leading-tight">{seg.title}</p>
                  <div className="flex items-center justify-between mt-2">
                    <PriorityBadge value={seg.priority} />
                    {seg.due_date && <span className="text-xs text-gray-500">{format(new Date(seg.due_date), 'MMM d')}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TableView({ segments, navigate }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm min-w-[700px]">
        <thead>
          <tr className="border-b border-gray-800">
            {['Title','Priority','Status','Start','Due Date','Team Size'].map(h => (
              <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 first:pl-5">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/50">
          {segments.map(seg => (
            <tr key={seg.id} onClick={() => navigate(`/segments/${seg.id}`)} className="hover:bg-gray-800/40 cursor-pointer transition-colors">
              <td className="px-4 py-3 pl-5 font-medium text-gray-100">{seg.title}</td>
              <td className="px-4 py-3"><PriorityBadge value={seg.priority} /></td>
              <td className="px-4 py-3"><StatusBadge value={seg.status} /></td>
              <td className="px-4 py-3 text-gray-400 text-xs">{seg.start_date ? format(new Date(seg.start_date), 'MMM d') : '—'}</td>
              <td className="px-4 py-3 text-gray-400 text-xs">{seg.due_date  ? format(new Date(seg.due_date),  'MMM d, yyyy') : '—'}</td>
              <td className="px-4 py-3 text-gray-400">{seg.segment_roles?.length ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Views() {
  const navigate = useNavigate()
  const [segments, setSegments] = useState([])
  const [loading, setLoading]   = useState(true)
  const [view, setView]         = useState('gantt')

  useEffect(() => {
    supabase
      .from('segments')
      .select('*, segment_roles(user_id)')
      .order('due_date', { ascending: true })
      .then(({ data }) => { setSegments(data ?? []); setLoading(false) })
  }, [])

  return (
    <div>
      <PageHeader title="Views" subtitle="Visual overviews of all segments" />

      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit mb-6">
        {[
          { id: 'gantt', label: 'Gantt' },
          { id: 'tiles', label: 'Kanban' },
          { id: 'table', label: 'Table' },
        ].map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === v.id ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><Spinner size={8} /></div>
      ) : (
        <>
          {view === 'gantt' && <div className="card p-6"><GanttView segments={segments} /></div>}
          {view === 'tiles' && <TileView segments={segments} navigate={navigate} />}
          {view === 'table' && <TableView segments={segments} navigate={navigate} />}
        </>
      )}
    </div>
  )
}
