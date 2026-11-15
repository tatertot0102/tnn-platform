import { joinPath } from './media'

const isHidden = name => name.startsWith('.')

const fileOf = entry => new Promise((resolve, reject) => entry.file(resolve, reject))
const readBatch = reader => new Promise((resolve, reject) => reader.readEntries(resolve, reject))

/**
 * Reads a drop that may contain folders. Returns null for a plain file drop
 * (use dataTransfer.files), otherwise every file with its folder path.
 * Must be called synchronously inside the drop handler.
 * @param {DataTransfer} dataTransfer
 * @returns {Promise<{ file: File, dir: string }[]> | null}
 */
export function readDroppedTree(dataTransfer) {
  const entries = Array.from(dataTransfer.items ?? []).map(i => i.webkitGetAsEntry?.()).filter(Boolean)
  if (!entries.some(e => e.isDirectory)) return null
  const out = []
  async function walk(entry, dir) {
    if (isHidden(entry.name)) return
    if (entry.isFile) {
      out.push({ file: await fileOf(entry), dir })
      return
    }
    const reader = entry.createReader()
    const inside = joinPath(dir, entry.name)
    // readEntries returns at most ~100 entries per call.
    for (let batch = await readBatch(reader); batch.length; batch = await readBatch(reader)) {
      for (const child of batch) await walk(child, inside)
    }
  }
  return entries.reduce((p, e) => p.then(() => walk(e, '')), Promise.resolve()).then(() => out)
}

/**
 * Files from an <input webkitdirectory>, with their folder paths.
 * @param {FileList} fileList
 */
export function treeFromInput(fileList) {
  return Array.from(fileList ?? [])
    .filter(f => !f.webkitRelativePath.split('/').some(isHidden))
    .map(file => ({ file, dir: file.webkitRelativePath.split('/').slice(0, -1).join('/') }))
}
