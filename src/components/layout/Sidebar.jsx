import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  LayoutDashboard, Film, CheckSquare, BarChart2,
  Users, Settings, LogOut, Bell, Menu, X, UserCircle
} from 'lucide-react'
import { useState } from 'react'

const baseNavItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/segments',  icon: Film,            label: 'Segments' },
  { to: '/tasks',     icon: CheckSquare,     label: 'Tasks' },
]

export default function Sidebar() {
  const { profile, signOut, isExec, canViewsAccess } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const handleSignOut = async () => { await signOut(); navigate('/login') }

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
    }`

  const navItems = [
    ...baseNavItems,
    ...(canViewsAccess ? [{ to: '/views', icon: BarChart2, label: 'Views' }] : []),
  ]

  const execItems = [
    isExec && { to: '/members',   icon: Users,     label: 'Members' },
    isExec && { to: '/reminders', icon: Bell,      label: 'Reminders' },
    isExec && { to: '/settings',  icon: Settings,  label: 'Settings' },
  ].filter(Boolean)

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="px-4 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">T</span>
          </div>
          <div>
            <p className="font-bold text-white text-sm">TNN</p>
            <p className="text-gray-500 text-xs">News Network</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} className={linkClass} onClick={() => setOpen(false)}>
            <Icon size={16} />{label}
          </NavLink>
        ))}
        {execItems.length > 0 && (
          <>
            <p className="px-3 pt-4 pb-1 text-xs font-semibold text-gray-600 uppercase tracking-wider">
              {isExec ? 'Exec' : 'Tools'}
            </p>
            {execItems.map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} className={linkClass} onClick={() => setOpen(false)}>
                <Icon size={16} />{label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="px-3 py-4 border-t border-gray-800 space-y-1">
        <NavLink to="/profile" className={linkClass} onClick={() => setOpen(false)}>
          <UserCircle size={16} />My Profile
        </NavLink>
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
            {profile?.full_name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-100 truncate">{profile?.full_name ?? 'User'}</p>
            <p className="text-xs text-gray-500 capitalize">{profile?.role ?? 'member'}</p>
          </div>
          <button onClick={handleSignOut} className="text-gray-600 hover:text-gray-300 transition-colors">
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <button className="fixed top-4 left-4 z-50 p-2 bg-gray-900 rounded-lg border border-gray-800 md:hidden" onClick={() => setOpen(!open)}>
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>
      {open && <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 w-56 bg-gray-950 border-r border-gray-800 transform transition-transform md:hidden ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarContent />
      </aside>
      <aside className="hidden md:flex w-56 bg-gray-950 border-r border-gray-800 flex-col fixed inset-y-0 left-0">
        <SidebarContent />
      </aside>
    </>
  )
}