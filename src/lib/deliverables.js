import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { ensureFolder, joinPath, uploadFile } from './media'

// Drafts and finals: files in a segment's media folder marked with a stage,
// optionally attached to a subtask or approval gate.

export const STAGES = {
  draft: { label: 'Draft', folder: 'Drafts', chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  final: { label: 'Final', folder: 'Final', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' },
}

export const deliverablesKey = segmentId => ['segment', segmentId, 'deliverables']

// Every mark across all segments, for the Media page.
export async function listAllDeliverables() {
  const { data, error } = await supabase.from('segment_deliverables').select('id, path, stage, segment_id')
  if (error) throw error
  return data
}

export async function listDeliverables(segmentId) {
  const { data, error } = await supabase.from('segment_deliverables')
    .select('id, path, stage, subtask_id, gate_id, created_by, created_at')
    .eq('segment_id', segmentId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/**
 * Marks a file as a draft or final (one mark per file per segment). Only the
 * fields given are changed, so linking to a gate keeps an existing subtask link.
 */
export async function markDeliverable({ segmentId, path, stage, subtaskId, gateId }) {
  const row = { segment_id: segmentId, path, stage, updated_at: new Date().toISOString() }
  if (subtaskId !== undefined) row.subtask_id = subtaskId
  if (gateId !== undefined) row.gate_id = gateId
  const { error } = await supabase.from('segment_deliverables').upsert(row, { onConflict: 'segment_id,path' })
  if (error) throw error
}

export async function unmarkDeliverables(segmentId, paths) {
  const { error } = await supabase.from('segment_deliverables').delete().eq('segment_id', segmentId).in('path', paths)
  if (error) throw error
}

// Uploads into "<segment folder>/Drafts" or "/Final" and marks the file.
export async function uploadDeliverable({ segmentId, folder, file, stage, subtaskId, gateId, onProgress, signal }) {
  const target = await ensureFolder(folder, STAGES[stage].folder)
  const saved = await uploadFile(target, file, { onProgress, signal })
  const path = joinPath(target, saved)
  await markDeliverable({ segmentId, path, stage, subtaskId, gateId })
  return path
}

export function useDeliverables(segmentId, { enabled = true } = {}) {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: deliverablesKey(segmentId), queryFn: () => listDeliverables(segmentId), enabled: enabled && Boolean(segmentId) })
  const list = query.data ?? []
  return {
    ...query,
    list,
    byPath: Object.fromEntries(list.map(d => [d.path, d])),
    forSubtask: id => list.filter(d => d.subtask_id === id),
    forGate: id => list.filter(d => d.gate_id === id),
    refresh: () => queryClient.invalidateQueries({ queryKey: deliverablesKey(segmentId) }),
  }
}
