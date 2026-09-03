import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/ui/PageHeader'
import { useNotifications } from '../context/NotificationsContext'
import { formatDistanceToNow } from 'date-fns'
import { Bell, MessageCircle, AtSign, UserPlus, Megaphone, CheckCheck } from 'lucide-react'

const TYPE_ICON = {
  message: MessageCircle,
  mention: AtSign,
  role_assigned: UserPlus,
  announcement: Megaphone,
}

export default function Notifications() {
  const { notifications, markAsRead, markAllAsRead } = useNotifications()
  const navigate = useNavigate()

  function handleClick(n) {
    if (!n.read) markAsRead(n.id)
    if (n.link_url) navigate(n.link_url)
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={notifications.length > 0 ? `${notifications.filter(n => !n.read).length} unread` : undefined}
        actions={notifications.some(n => !n.read) && (
          <button onClick={markAllAsRead} className="btn-ghost flex items-center gap-1.5 text-xs border border-gray-800">
            <CheckCheck size={13} /> Mark all read
          </button>
        )}
      />

      {notifications.length === 0 ? (
        <div className="card p-6 flex flex-col items-center text-center gap-2 py-16">
          <Bell size={20} className="text-gray-600" />
          <p className="text-gray-400 text-sm">No notifications yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => {
            const Icon = TYPE_ICON[n.type] ?? Bell
            return (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`card w-full text-left p-4 flex items-start gap-3 transition-colors hover:border-gray-700 ${!n.read ? 'border-brand-700/50 bg-brand-950/10' : ''}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${!n.read ? 'bg-brand-600' : 'bg-gray-800'}`}>
                  <Icon size={14} className={!n.read ? 'text-white' : 'text-gray-400'} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${!n.read ? 'text-gray-100 font-medium' : 'text-gray-300'}`}>{n.title}</p>
                  {n.body && <p className="text-xs text-gray-500 mt-0.5 truncate">{n.body}</p>}
                  <p className="text-[11px] text-gray-600 mt-1">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
                </div>
                {!n.read && <span className="w-2 h-2 rounded-full bg-brand-400 flex-shrink-0 mt-1.5" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
