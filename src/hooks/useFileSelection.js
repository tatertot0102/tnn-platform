import { useCallback, useRef, useState } from 'react'

/**
 * Finder-style selection over an ordered list of keys: click selects one,
 * ⌘/Ctrl-click toggles, Shift-click selects a range from the last click.
 * @param {string[]} keys items in display order
 */
export function useFileSelection(keys) {
  const [selected, setSelected] = useState(() => new Set())
  const anchor = useRef(null)

  const click = useCallback((key, event = {}) => {
    const additive = event.metaKey || event.ctrlKey
    if (event.shiftKey && anchor.current !== null && keys.includes(anchor.current)) {
      const a = keys.indexOf(anchor.current)
      const b = keys.indexOf(key)
      const range = keys.slice(Math.min(a, b), Math.max(a, b) + 1)
      setSelected(prev => new Set(additive ? [...prev, ...range] : range))
      return
    }
    anchor.current = key
    setSelected(prev => {
      if (!additive) return new Set([key])
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [keys])

  const toggle = useCallback(key => {
    anchor.current = key
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const selectAll = useCallback(() => setSelected(new Set(keys)), [keys])
  const clear = useCallback(() => { anchor.current = null; setSelected(new Set()) }, [])

  return { selected, click, toggle, selectAll, clear }
}
