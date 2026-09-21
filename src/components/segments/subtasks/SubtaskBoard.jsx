import { useEffect, useState } from 'react'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, DragOverlay,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable'
import { Flag } from 'lucide-react'
import SortableSubtaskRow from './SortableSubtaskRow'
import StaticSubtaskRow from './StaticSubtaskRow'
import MilestoneBlock, { AddItemBar } from './MilestoneBlock'
import MilestoneDropZone from './MilestoneDropZone'
import SubtaskActionsSheet from './SubtaskActionsSheet'
import SubmitUrlModal from './SubmitUrlModal'
import ApprovalGateRow from '../ApprovalGateRow'
import ApprovalGateModal from '../ApprovalGateModal'
import ApprovalFeedbackModal from '../ApprovalFeedbackModal'
import { useMediaQuery, DESKTOP_QUERY } from '../../../hooks/useMediaQuery'
import { FILTERS } from '../../../lib/subtaskFilters'

function useScrollToHighlight(elementId, ready) {
  useEffect(() => {
    if (!elementId || !ready) return
    const el = document.getElementById(elementId)
    el?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
  }, [elementId, ready])
}

/**
 * The subtask list for one segment: milestones, subtasks and approval gates,
 * drag to reorder (mouse, touch, or keyboard), plus the modals they open.
 * Used by the Subtasks tab and by the full-screen subtasks page.
 */
export default function SubtaskBoard({ work, highlightId, highlightGateId, filter = 'all' }) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const {
    subtasks, milestones, gates, members, segmentMembers, roles, canEdit, isExec, profileId, segment, orderedItems,
  } = work

  const [activeId, setActiveId] = useState(null)
  const [overId, setOverId] = useState(null)
  const [gateModal, setGateModal] = useState(null)       // { gate, milestoneId }
  const [feedbackModal, setFeedbackModal] = useState(null) // { gateId, kind }
  const [submitTask, setSubmitTask] = useState(null)
  const [sheetTaskId, setSheetTaskId] = useState(null)
  const [newMilestone, setNewMilestone] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // A short press-and-hold on touch, so swiping the list still scrolls it.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useScrollToHighlight(highlightId && `subtask-${highlightId}`, subtasks.length > 0)
  useScrollToHighlight(highlightGateId && `gate-${highlightGateId}`, gates.length > 0)

  const filterTest = FILTERS[filter]?.test ?? FILTERS.all.test
  const isFiltered = filter !== 'all'
  const visible = milestoneId => orderedItems(milestoneId).filter(row => filterTest(row, profileId))

  // Live rows (with blockedBy) for the sheet and modals, so they never show stale data.
  const allRows = [null, ...milestones.map(m => m.id)].flatMap(orderedItems)
  const sheetTask = allRows.find(r => r.id === sheetTaskId && r.kind === 'subtask')
  const feedbackGate = feedbackModal && gates.find(g => g.id === feedbackModal.gateId)

  // ── Drag and drop ──
  function findItem(itemId) {
    const task = subtasks.find(t => t.id === itemId)
    if (task) return { kind: 'subtask', item: task }
    const gate = gates.find(g => g.id === itemId)
    return gate ? { kind: 'gate', item: gate } : null
  }

  function findContainer(itemId) {
    const found = findItem(itemId)
    if (!found) return null
    return found.item.milestone_id ? `milestone-${found.item.milestone_id}` : 'ungrouped'
  }

  const containerMilestoneId = container =>
    container?.startsWith('milestone-') ? container.replace('milestone-', '') : null

  function handleDragOver({ active, over }) {
    if (!over) { setOverId(null); return }
    setOverId(over.id)
    const found = findItem(active.id)
    if (!found) return
    const activeContainer = findContainer(active.id)
    const overContainer = findItem(over.id) ? findContainer(over.id) : over.id
    if (activeContainer === overContainer) return
    work.moveItemLocal(found.kind, active.id, containerMilestoneId(overContainer))
  }

  function handleDragEnd({ active, over }) {
    setActiveId(null); setOverId(null)
    if (!over || !findItem(active.id)) return
    const overContainer = findItem(over.id) ? findContainer(over.id) : over.id
    const milestoneId = containerMilestoneId(overContainer)

    // The cache already reflects any cross-list move made during dragOver.
    let list = orderedItems(milestoneId)
    const oldIdx = list.findIndex(i => i.id === active.id)
    const newIdx = list.findIndex(i => i.id === over.id)
    if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) list = arrayMove(list, oldIdx, newIdx)
    work.persistOrder(list, milestoneId)
  }

  const dragDisabled = isFiltered || !canEdit
  const activeItem = activeId ? allRows.find(r => r.id === activeId) : null

  const renderRow = row => row.kind === 'gate' ? (
    <ApprovalGateRow key={row.id} gate={row} members={members} profileId={profileId}
      isExec={isExec} canEdit={canEdit} isDesktop={isDesktop} dragDisabled={dragDisabled}
      highlighted={row.id === highlightGateId}
      onApprove={gate => work.submitGateFeedback(gate, 'approved', '')}
      onRequestChanges={gate => setFeedbackModal({ gateId: gate.id, kind: 'changes_requested' })}
      onComments={gate => setFeedbackModal({ gateId: gate.id, kind: 'comment' })}
      onEdit={gate => setGateModal({ gate })}
      onDelete={gateId => confirm('Delete this approval gate and its feedback?') && work.deleteGate(gateId)} />
  ) : (
    <SortableSubtaskRow key={row.id} task={row} members={segmentMembers} blockedBy={row.blockedBy}
      canEdit={canEdit} isExec={isExec} profileId={profileId} isDesktop={isDesktop} dragDisabled={dragDisabled}
      highlighted={row.id === highlightId}
      onToggle={work.toggleSubtask} onAssign={work.assignSubtask} onDateChange={work.setSubtaskDate}
      onRename={work.renameSubtask} onDelete={work.deleteSubtask} onSubmitClick={setSubmitTask}
      onOpen={task => setSheetTaskId(task.id)} />
  )

  const ungrouped = visible(null)

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter}
        onDragStart={({ active }) => setActiveId(active.id)} onDragOver={handleDragOver}
        onDragEnd={handleDragEnd} onDragCancel={() => { setActiveId(null); setOverId(null) }}
        accessibility={{ screenReaderInstructions: { draggable: 'To reorder, press Space or Enter to pick the item up, use the arrow keys to move it, then press Space or Enter again to drop it. Press Escape to cancel.' } }}>
        {segmentMembers.length === 0 && isExec && (
          <p className="text-xs text-amber-500 mb-4 px-1">Assign people to roles first to enable subtask assignment.</p>
        )}

        {milestones.map(m => (
          <MilestoneBlock key={m.id} milestone={m} items={visible(m.id)} renderRow={renderRow}
            allTasks={subtasks.filter(t => t.milestone_id === m.id)} filtered={isFiltered}
            onDeleteMilestone={id => confirm('Delete milestone? Its items become ungrouped.') && work.deleteMilestone(id)}
            onRename={work.renameMilestone} onAddSubtask={work.addSubtask}
            onAddGate={milestoneId => setGateModal({ gate: null, milestoneId })}
            canEdit={canEdit} isExec={isExec} isOver={overId === `milestone-${m.id}`} />
        ))}

        <section aria-label={milestones.length ? 'Ungrouped' : 'Subtasks'}
          className={`card p-3 md:p-5 mb-4 transition-colors duration-normal ${overId === 'ungrouped' ? 'border-brand-400/50 bg-brand-900/10' : ''}`}>
          {milestones.length > 0 && <h3 className="text-xs text-gray-500 font-medium mb-2 uppercase tracking-wider">Ungrouped</h3>}
          <MilestoneDropZone id="ungrouped" isOver={overId === 'ungrouped'}>
            <SortableContext items={ungrouped.map(i => i.id)} strategy={verticalListSortingStrategy}>
              {ungrouped.length === 0 && (
                <p className="text-sm text-gray-500 py-3 text-center">
                  {isFiltered ? 'Nothing here matches this filter.'
                    : milestones.length ? 'Drop subtasks here to ungroup them' : 'No subtasks yet.'}
                </p>
              )}
              {ungrouped.map(renderRow)}
            </SortableContext>
          </MilestoneDropZone>
          {canEdit && !isFiltered && (
            <AddItemBar placeholder="Add a subtask..."
              onAddSubtask={title => work.addSubtask(title, null)}
              onAddGate={() => setGateModal({ gate: null, milestoneId: null })} />
          )}
        </section>

        {isExec && !isFiltered && (
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); work.addMilestone(newMilestone); setNewMilestone('') }}>
            <input className="input flex-1" placeholder="New milestone name..." aria-label="New milestone name"
              value={newMilestone} onChange={e => setNewMilestone(e.target.value)} />
            <button type="submit" className="btn-ghost flex items-center gap-2 border border-gray-700">
              <Flag size={14} className="text-brand-400" aria-hidden="true" /> <span className="hidden sm:inline">Add Milestone</span>
            </button>
          </form>
        )}

        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}>
          {activeItem && <StaticSubtaskRow item={activeItem} />}
        </DragOverlay>
      </DndContext>

      {sheetTask && (
        <SubtaskActionsSheet task={sheetTask} members={segmentMembers} canEdit={canEdit} isExec={isExec}
          profileId={profileId} work={work} onClose={() => setSheetTaskId(null)}
          onSubmitClick={task => { setSheetTaskId(null); setSubmitTask(task) }} />
      )}

      {submitTask && (
        <SubmitUrlModal task={submitTask} onClose={() => setSubmitTask(null)} onSave={work.setSubmitUrl} />
      )}

      {gateModal && (
        <ApprovalGateModal open onClose={() => setGateModal(null)}
          gate={gateModal.gate} members={members} teamIds={roles.map(r => r.user_id)}
          milestones={milestones} defaultMilestoneId={gateModal.milestoneId ?? null}
          onSave={(values, approverIds) => work.saveGate(values, approverIds, gateModal.gate)} />
      )}

      {feedbackGate && (
        <ApprovalFeedbackModal open onClose={() => setFeedbackModal(null)}
          gate={feedbackGate} kind={feedbackModal.kind}
          feedback={feedbackGate.approval_feedback ?? []}
          members={members} segmentTitle={segment?.title}
          onSubmit={body => work.submitGateFeedback(feedbackGate, feedbackModal.kind, body)} />
      )}
    </>
  )
}
