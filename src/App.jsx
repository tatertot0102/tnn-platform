import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { NotificationsProvider } from './context/NotificationsContext'
import AppLayout from './components/layout/AppLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Segments from './pages/Segments'
import SegmentDetail from './pages/SegmentDetail'
import Tasks from './pages/Tasks'
import Views from './pages/Views'
import Members from './pages/Members'
import Settings from './pages/Settings'
import Notifications from './pages/Notifications'
import Profile from './pages/Profile'
import Chat from './pages/Chat'
import Spinner from './components/ui/Spinner'
import ResetPassword from './pages/ResetPassword'

function ProtectedRoute({ children, execOnly = false, viewsOnly = false }) {
  const { user, profile, loading, isExec, canViewsAccess } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950"><Spinner size={8} /></div>
  )
  if (!user) return <Navigate to="/login" replace />
  if (execOnly && !isExec) return <Navigate to="/dashboard" replace />
  if (viewsOnly && !canViewsAccess) return <Navigate to="/dashboard" replace />
  return children
}

function AppRoutes() {
  const { user, loading } = useAuth()

  // Wait for auth to resolve before rendering any route.
  // Without this, the /login route sees user=null during the async
  // getSession call and flashes Login (or bounces an authed user back).
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <Spinner size={8} />
    </div>
  )

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/dashboard"     element={<Dashboard />} />
        <Route path="/segments"      element={<Segments />} />
        <Route path="/segments/:id"  element={<SegmentDetail />} />
        <Route path="/tasks"         element={<Tasks />} />
        <Route path="/chat"          element={<Chat />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/profile"       element={<Profile />} />
        <Route path="/views"         element={<ProtectedRoute viewsOnly><Views /></ProtectedRoute>} />
        <Route path="/members"       element={<ProtectedRoute execOnly><Members /></ProtectedRoute>} />
        <Route path="/settings"      element={<ProtectedRoute execOnly><Settings /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <NotificationsProvider>
            <AppRoutes />
          </NotificationsProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
