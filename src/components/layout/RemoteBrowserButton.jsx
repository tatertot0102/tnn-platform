import { useEffect, useState } from 'react'
import { ChevronDown, Globe, Loader2 } from 'lucide-react'
import { requestBrowserLink, controlBrowser } from '../../lib/browser'

const BUTTON_CLASS =
  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ' +
  'text-gray-400 hover:text-gray-100 hover:bg-gray-800 disabled:opacity-60 disabled:cursor-wait'

const ITEM_CLASS =
  'w-full text-left px-3 py-1.5 rounded-md text-xs text-gray-400 hover:text-gray-100 hover:bg-gray-800 disabled:opacity-50'

// What each menu action does and, when it needs one, the question asked first.
const ACTIONS = [
  { id: 'restart', label: 'Restart browser', done: 'Browser restarted.', confirm: 'Restart the browser? Open tabs are lost.' },
  { id: 'stop', label: 'Stop browser', done: 'Browser stopped.' },
  { id: 'start', label: 'Start browser', done: 'Browser started.' },
  { id: 'signout', label: 'Sign out of browser', done: 'Signed out of the remote browser.' },
  {
    id: 'reset',
    label: 'Reset browser',
    done: 'Browser reset.',
    confirm: 'Reset the browser? This deletes its saved logins, history and installed apps.',
  },
]

/** Opens the remote browser in a new tab, with a menu to restart, stop or sign out of it. */
export default function RemoteBrowserButton({ onOpened }) {
  const [busy, setBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [running, setRunning] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Learn whether the browser is running whenever the menu is opened.
  useEffect(() => {
    if (!menuOpen) return
    controlBrowser('status').then((s) => setRunning(s.running)).catch(() => setRunning(null))
  }, [menuOpen])

  const handleOpen = async () => {
    // Open the tab now, inside the click, so popup blockers allow it.
    const tab = window.open('', '_blank')
    if (tab) tab.opener = null
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const url = await requestBrowserLink()
      if (tab) tab.location.href = url
      else window.location.href = url
      onOpened?.()
    } catch (err) {
      tab?.close()
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleAction = async (action) => {
    if (action.confirm && !window.confirm(action.confirm)) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await controlBrowser(action.id)
      setRunning(result.running)
      setMessage(action.done)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-1">
        <button type="button" className={`${BUTTON_CLASS} flex-1`} onClick={handleOpen} disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
          Remote Browser
        </button>
        <button
          type="button"
          className={`${BUTTON_CLASS} px-2`}
          aria-label="Remote browser controls"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <ChevronDown size={14} className={menuOpen ? 'rotate-180' : ''} />
        </button>
      </div>
      {menuOpen && (
        <div className="ml-9 mt-1 space-y-0.5">
          {running !== null && (
            <p className="px-3 text-[11px] text-gray-500">{running ? 'Running' : 'Stopped'}</p>
          )}
          {ACTIONS.filter((a) => (a.id === 'start' ? running === false : a.id !== 'stop' || running !== false)).map((a) => (
            <button key={a.id} type="button" className={ITEM_CLASS} disabled={busy} onClick={() => handleAction(a)}>
              {a.label}
            </button>
          ))}
        </div>
      )}
      {message && <p role="status" className="px-3 pt-1 text-xs text-gray-400">{message}</p>}
      {error && <p role="alert" className="px-3 pt-1 text-xs text-red-400">{error}</p>}
    </div>
  )
}
