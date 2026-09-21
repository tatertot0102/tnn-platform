import { X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

// A centred dialog on larger screens and a bottom sheet on phones, where it is
// easier to reach. Locks page scroll and moves focus inside while open.
export default function Modal({ open, onClose, title, children, size = 'md' }) {
  const titleId = useId()
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement
    const handler = e => e.key === 'Escape' && onCloseRef.current()
    document.addEventListener('keydown', handler)

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    // Respect an autoFocus field inside; otherwise focus the panel itself.
    requestAnimationFrame(() => {
      if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus()
    })

    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.()
    }
  }, [open])

  if (!open) return null

  const sizes = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/70 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={`relative bg-gray-900 border border-gray-800 w-full ${sizes[size]} max-h-[92dvh] sm:max-h-[90vh] flex flex-col shadow-2xl shadow-black/50 rounded-t-2xl sm:rounded-2xl animate-sheet-in sm:animate-pop-in focus:outline-none`}>
        <div className="sm:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-gray-700" aria-hidden="true" />
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-gray-800">
          <h2 id={titleId} className="text-base font-semibold text-gray-100">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="p-1.5 -mr-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
