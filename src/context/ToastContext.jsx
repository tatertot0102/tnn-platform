import { createContext, useCallback, useContext, useState } from 'react'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'

const ToastContext = createContext({})

const ICONS = { success: CheckCircle2, error: XCircle, info: Info }
const STYLES = {
  success: 'border-green-800/60 bg-green-950/90 text-green-200',
  error: 'border-red-800/60 bg-red-950/90 text-red-200',
  info: 'border-gray-700 bg-gray-900/95 text-gray-200',
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  const push = useCallback((type, message) => {
    if (!message) return
    const id = Math.random().toString(36).slice(2)
    setToasts(t => [...t, { id, type, message }])
    setTimeout(() => dismiss(id), 5000)
  }, [dismiss])

  const toast = {
    success: (message) => push('success', message),
    error: (message) => push('error', message),
    info: (message) => push('info', message),
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map(t => {
          const Icon = ICONS[t.type] ?? Info
          return (
            <div
              key={t.id}
              className={`flex items-start gap-2.5 border rounded-xl px-3.5 py-3 shadow-2xl backdrop-blur-sm animate-[fadeIn_0.15s_ease-out] ${STYLES[t.type] ?? STYLES.info}`}
            >
              <Icon size={16} className="flex-shrink-0 mt-0.5" />
              <p className="text-sm flex-1 leading-snug">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity">
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
