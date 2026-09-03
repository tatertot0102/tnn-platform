import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const NotificationsContext = createContext({})

export function NotificationsProvider({ children }) {
  const { profile } = useAuth()
  const [notifications, setNotifications] = useState([])

  useEffect(() => {
    if (!profile) { setNotifications([]); return }

    let active = true
    supabase.from('notifications').select('*').eq('user_id', profile.id)
      .order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { if (active) setNotifications(data ?? []) })

    const sub = supabase
      .channel(`notifications-${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        payload => setNotifications(n => n.some(x => x.id === payload.new.id) ? n : [payload.new, ...n]))
      .subscribe()

    return () => { active = false; supabase.removeChannel(sub) }
  }, [profile])

  async function markAsRead(id) {
    setNotifications(n => n.map(x => x.id === id ? { ...x, read: true } : x))
    await supabase.from('notifications').update({ read: true }).eq('id', id)
  }

  async function markAllAsRead() {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id)
    if (unreadIds.length === 0) return
    setNotifications(n => n.map(x => ({ ...x, read: true })))
    await supabase.from('notifications').update({ read: true }).in('id', unreadIds)
  }

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead }}>
      {children}
    </NotificationsContext.Provider>
  )
}

export const useNotifications = () => useContext(NotificationsContext)
