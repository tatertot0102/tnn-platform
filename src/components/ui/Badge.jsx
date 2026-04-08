import { PRIORITIES, STATUSES, DEPARTMENTS } from '../../lib/constants'

export function PriorityBadge({ value }) {
  const p = PRIORITIES[value] ?? PRIORITIES['tbd']
  return <span className={`badge ${p.color}`}>{p.label}</span>
}

export function StatusBadge({ value }) {
  const s = STATUSES[value] ?? STATUSES['not-started']
  return <span className={`badge ${s.color}`}>{s.label}</span>
}

export function DeptBadge({ value }) {
  const d = DEPARTMENTS[value]
  if (!d) return null
  return <span className={`badge ${d.color}`}>{d.label}</span>
}
