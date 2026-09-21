import { getSubtaskAssigneeIds, gateApprovers } from './subtasks'

// Which rows each filter chip keeps. Filters hide rows but never change order,
// so dragging is turned off while one is active.
export const FILTERS = {
  all:      { label: 'All',      test: () => true },
  mine:     { label: 'Mine',     test: (row, me) => row.kind === 'gate'
    ? gateApprovers(row).some(a => a.user_id === me)
    : getSubtaskAssigneeIds(row).includes(me) },
  open:     { label: 'Open',     test: row => row.kind === 'gate' ? row.status !== 'approved' : !row.completed },
  blocked:  { label: 'Blocked',  test: row => !!row.blockedBy },
  approval: { label: 'Needs my approval', test: (row, me) => row.kind === 'gate'
    && gateApprovers(row).some(a => a.user_id === me && a.status !== 'approved') },
}
