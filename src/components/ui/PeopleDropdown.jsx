import { useEffect, useRef, useState } from 'react'
import { Search, Check, ChevronDown, X, User } from 'lucide-react'

// A searchable multi-select dropdown for picking people (or any labeled
// option list). Renders selected picks as removable chips above a trigger
// button, replacing the old "wall of toggle buttons" pattern.
export default function PeopleDropdown({
  options, selectedIds, onChange, placeholder = 'Select people...', disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)
  const searchRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      requestAnimationFrame(() => searchRef.current?.focus())
    }
  }, [open])

  const selected = options.filter(o => selectedIds.includes(o.id))
  const filtered = options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))

  function toggle(id) {
    onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id])
  }

  function remove(id, e) {
    e.stopPropagation()
    onChange(selectedIds.filter(x => x !== id))
  }

  return (
    <div className="relative" ref={ref}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={e => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(o => !o) } }}
        className={`input flex items-center gap-1.5 flex-wrap min-h-10 text-left cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {selected.length === 0 && <span className="text-gray-500 text-sm">{placeholder}</span>}
        {selected.map(m => (
          <span
            key={m.id}
            className="inline-flex items-center gap-1 bg-brand-600 text-white text-xs rounded-full pl-2 pr-1 py-0.5"
          >
            {m.label}
            <button type="button" onClick={e => remove(m.id, e)} className="hover:bg-brand-700 rounded-full p-0.5 transition-colors">
              <X size={10} />
            </button>
          </span>
        ))}
        <ChevronDown size={14} className="ml-auto text-gray-500 flex-shrink-0" />
      </div>

      {open && !disabled && (
        <div className="absolute z-30 mt-1.5 w-full bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800">
            <Search size={13} className="text-gray-500 flex-shrink-0" />
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search..."
              className="bg-transparent text-sm text-gray-100 placeholder-gray-500 outline-none flex-1"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1.5">
            {filtered.length === 0 && (
              <p className="text-xs text-gray-600 px-2.5 py-2">No matches.</p>
            )}
            {filtered.map(o => {
              const checked = selectedIds.includes(o.id)
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggle(o.id)}
                  className={`w-full flex items-center gap-2.5 text-left text-sm px-2.5 py-1.5 rounded-lg transition-colors ${checked ? 'bg-brand-600/20 text-brand-200' : 'text-gray-300 hover:bg-gray-800'}`}
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${checked ? 'bg-brand-500 border-brand-500' : 'border-gray-600'}`}>
                    {checked && <Check size={11} className="text-white" />}
                  </span>
                  <span className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <User size={11} className="text-gray-400" />
                  </span>
                  <span className="truncate flex-1">{o.label}</span>
                  {o.sublabel && <span className="text-xs text-gray-600 flex-shrink-0">{o.sublabel}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
