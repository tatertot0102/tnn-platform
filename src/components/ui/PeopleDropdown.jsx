import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Check, ChevronDown, X, Users } from 'lucide-react'

const CHIP_LIMIT = 6

function initials(label = '') {
  return label.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}

// A searchable multi-select for picking people. Type to filter, arrow keys to
// move, Enter to toggle, Backspace on an empty search to drop the last pick.
// Options may carry `group` (a section header) and `sublabel` (e.g. an email).
export default function PeopleDropdown({
  options, selectedIds, onChange, placeholder = 'Select people...', disabled = false,
  allowSelectAll = true,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const ref = useRef(null)
  const searchRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (open) requestAnimationFrame(() => searchRef.current?.focus())
  }, [open])

  // Reset the search from the event that opens the menu, not from an effect,
  // so opening does not cost an extra render pass.
  function setOpenState(next) {
    if (next) { setQuery(''); setCursor(0) }
    setOpen(next)
  }

  const selected = useMemo(
    () => selectedIds.map(id => options.find(o => o.id === id)).filter(Boolean),
    [options, selectedIds]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o =>
      o.label?.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q)
    )
  }, [options, query])

  // Keep the highlighted row in view as the cursor moves with the keyboard.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [cursor, filtered.length])

  function toggle(id) {
    onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id])
  }

  function remove(id, e) {
    e.stopPropagation()
    onChange(selectedIds.filter(x => x !== id))
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[cursor]) toggle(filtered[cursor].id) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpenState(false) }
    else if (e.key === 'Backspace' && !query && selectedIds.length > 0) {
      onChange(selectedIds.slice(0, -1))
    }
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every(o => selectedIds.includes(o.id))
  const overflow = selected.length - CHIP_LIMIT

  return (
    <div className="relative" ref={ref}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-expanded={open}
        onClick={() => !disabled && setOpenState(!open)}
        onKeyDown={e => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpenState(!open) } }}
        className={`input flex items-center gap-1.5 flex-wrap min-h-10 text-left cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${open ? 'border-brand-400' : ''}`}
      >
        {selected.length === 0 && <span className="text-gray-500 text-sm">{placeholder}</span>}
        {selected.slice(0, CHIP_LIMIT).map(m => (
          <span
            key={m.id}
            className="inline-flex items-center gap-1 bg-brand-600 text-white text-xs rounded-full pl-2 pr-1 py-0.5"
          >
            {m.label}
            <button
              type="button"
              aria-label={`Remove ${m.label}`}
              onClick={e => remove(m.id, e)}
              className="hover:bg-brand-700 rounded-full p-0.5 transition-colors"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        {overflow > 0 && (
          <span className="text-xs text-gray-400 bg-gray-700 rounded-full px-2 py-0.5">+{overflow} more</span>
        )}
        <ChevronDown size={14} className={`ml-auto flex-shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && !disabled && (
        <div className="absolute z-30 mt-1.5 w-full bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800">
            <Search size={13} className="text-gray-500 flex-shrink-0" />
            <input
              ref={searchRef}
              value={query}
              onChange={e => { setQuery(e.target.value); setCursor(0) }}
              onKeyDown={handleKeyDown}
              placeholder="Search by name or email..."
              className="bg-transparent text-sm text-gray-100 placeholder-gray-500 outline-none flex-1 min-w-0"
            />
            {allowSelectAll && filtered.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  const ids = filtered.map(o => o.id)
                  onChange(allFilteredSelected
                    ? selectedIds.filter(id => !ids.includes(id))
                    : [...new Set([...selectedIds, ...ids])])
                }}
                className="text-[11px] font-medium text-brand-400 hover:text-brand-300 whitespace-nowrap flex-shrink-0"
              >
                {allFilteredSelected ? 'Clear' : 'Select all'}
              </button>
            )}
          </div>

          <div ref={listRef} className="max-h-64 overflow-y-auto p-1.5">
            {filtered.length === 0 && (
              <p className="text-xs text-gray-600 px-2.5 py-3 text-center">No matches.</p>
            )}
            {filtered.map((o, i) => {
              const checked = selectedIds.includes(o.id)
              const showGroup = o.group && o.group !== filtered[i - 1]?.group
              return (
                <div key={o.id}>
                  {showGroup && (
                    <p className="flex items-center gap-1.5 px-2.5 pt-2 pb-1 text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
                      <Users size={10} /> {o.group}
                    </p>
                  )}
                  <button
                    type="button"
                    data-active={i === cursor}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => toggle(o.id)}
                    className={`w-full flex items-center gap-2.5 text-left text-sm px-2.5 py-1.5 rounded-lg transition-colors ${
                      checked ? 'text-brand-200' : 'text-gray-300'
                    } ${i === cursor ? 'bg-gray-800' : ''}`}
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${checked ? 'bg-brand-500 border-brand-500' : 'border-gray-600'}`}>
                      {checked && <Check size={11} className="text-white" />}
                    </span>
                    <span className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 text-[10px] font-semibold text-gray-300">
                      {initials(o.label)}
                    </span>
                    <span className="truncate flex-1">{o.label}</span>
                    {o.sublabel && <span className="text-[11px] text-gray-600 truncate max-w-[45%] flex-shrink-0">{o.sublabel}</span>}
                  </button>
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-800 text-[11px] text-gray-600">
            <span>{selectedIds.length} selected</span>
            <span className="hidden sm:inline">↑↓ to move · Enter to pick · Esc to close</span>
          </div>
        </div>
      )}
    </div>
  )
}
