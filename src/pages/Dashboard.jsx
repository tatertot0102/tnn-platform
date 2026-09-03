import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'
import { PriorityBadge, StatusBadge, DeptBadge } from '../components/ui/Badge'
import PageHeader from '../components/ui/PageHeader'
import Spinner from '../components/ui/Spinner'
import ErrorState from '../components/ui/ErrorState'
import { format, isAfter, isBefore, addDays } from 'date-fns'
import { AlertTriangle, Clock, Film, CheckSquare, Bell } from 'lucide-react'
import SlackReminderModal from '../components/dashboard/SlackReminderModal'

function StatCard({ icon: Icon, label, value, color = 'text-brand-400' }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3">
        <div className={color}><Icon size={20} /></div>
        <div>
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="text-gray-400 text-xs mt-0.5">{label}</p>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { profile, isExec } = useAuth()
  const [segments, setSegments] = useState([])
  const [tasks, setTasks]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [showReminder, setShowReminder] = useState(false)

  useEffect(() => { fetchData() }, [profile])

  async function fetchData() {
    if (!profile) return
    setLoading(true)
    setLoadError(false)

    if (isExec) {
      // Execs see everything
      const [{ data: segs, error: segError }, { data: taskData, error: taskError }] = await Promise.all([
        supabase.from('segments').select('*, segment_roles(user_id, role_type)')
          .order('due_date', { ascending: true }).limit(20),
        supabase.from('tasks').select('*').neq('status', 'done')
          .order('due_date', { ascending: true }).limit(10),
      ])
      if (segError || taskError) { setLoadError(true); setLoading(false); return }
      setSegments(segs ?? [])
      setTasks(taskData ?? [])
    } else {
      // Members: only segments they have a role on, only tasks assigned to them
      const { data: roleRows, error: roleError } = await supabase
        .from('segment_roles')
        .select('segment_id')
        .eq('user_id', profile.id)

      if (roleError) { setLoadError(true); setLoading(false); return }

      const segIds = [...new Set((roleRows ?? []).map(r => r.segment_id))]

      const [segsResult, tasksResult] = await Promise.all([
        segIds.length > 0
          ? supabase.from('segments').select('*, segment_roles(user_id, role_type)')
              .in('id', segIds).order('due_date', { ascending: true })
          : Promise.resolve({ data: [] }),
        supabase.from('tasks').select('*')
          .contains('assignee_ids', [profile.id])
          .neq('status', 'done')
          .order('due_date', { ascending: true }).limit(10),
      ])

      if (segsResult.error || tasksResult.error) { setLoadError(true); setLoading(false); return }
      setSegments(segsResult.data ?? [])
      setTasks(tasksResult.data ?? [])
    }

    setLoading(false)
  }

  const today   = new Date()
  const soon    = addDays(today, 7)
  const overdue = segments.filter(s => s.due_date && isBefore(new Date(s.due_date), today) && s.status !== 'done')
  const dueSoon = segments.filter(s => s.due_date && isAfter(new Date(s.due_date), today) && isBefore(new Date(s.due_date), soon) && s.status !== 'done')

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size={8} /></div>
  if (loadError) return <ErrorState message="Could not load your dashboard." onRetry={fetchData} />

  return (
    <div>
      <div className="flex items-center justify-end mb-4 flex-wrap gap-2">
        {isExec && (
          <button
            onClick={() => setShowReminder(true)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-200 border border-gray-800 hover:border-gray-700 rounded-lg px-2.5 py-1.5 transition-colors"
          >
            <Bell size={12} /> Send Slack Reminder
          </button>
        )}
      </div>
      <PageHeader
        title={`Hey, ${profile?.full_name?.split(' ')[0] ?? 'there'} 👋`}
        subtitle={isExec ? 'Segments, tasks, assignments, deadlines, and production workflow.' : 'Your assignments and tasks live here. Public publishing happens in the Public CMS.'}
      />
      <SlackReminderModal open={showReminder} onClose={() => setShowReminder(false)} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Film}          label={isExec ? 'Total Segments' : 'My Segments'} value={segments.length} color="text-brand-400" />
        <StatCard icon={CheckSquare}   label="Open Tasks"    value={tasks.length}    color="text-teal-400" />
        <StatCard icon={AlertTriangle} label="Overdue"       value={overdue.length}  color="text-red-400" />
        <StatCard icon={Clock}         label="Due This Week" value={dueSoon.length}  color="text-yellow-400" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-300">{isExec ? 'All Segments' : 'My Segments'}</h2>
            <Link to="/segments" className="text-xs text-brand-400 hover:underline">View all</Link>
          </div>
          <div className="space-y-2">
            {segments.length === 0 && <p className="text-gray-500 text-sm">No segments yet.</p>}
            {segments.slice(0, 8).map(seg => (
              <Link key={seg.id} to={`/segments/${seg.id}`}>
                <div className="card p-4 hover:border-gray-700 transition-colors cursor-pointer">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-100 truncate">{seg.title}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {seg.departments?.map(d => <DeptBadge key={d} value={d} />)}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <StatusBadge value={seg.status} />
                      {seg.due_date && (
                        <span className={`text-xs ${isBefore(new Date(seg.due_date), today) ? 'text-red-400' : 'text-gray-500'}`}>
                          {format(new Date(seg.due_date), 'MMM d')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-300">My Open Tasks</h2>
            <Link to="/tasks" className="text-xs text-brand-400 hover:underline">View all</Link>
          </div>
          <div className="space-y-2">
            {tasks.length === 0 && <p className="text-gray-500 text-sm">No open tasks 🎉</p>}
            {tasks.map(task => (
              <Link key={task.id} to="/tasks">
                <div className="card p-4 hover:border-gray-700 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-gray-100 truncate">{task.title}</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <PriorityBadge value={task.priority} />
                      {task.due_date && (
                        <span className={`text-xs ${isBefore(new Date(task.due_date), today) ? 'text-red-400' : 'text-gray-500'}`}>
                          {format(new Date(task.due_date), 'MMM d')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
