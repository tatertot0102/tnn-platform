import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
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
import Spinner from './components/ui/Spinner'

function ProtectedRoute({ children, execOnly = false }) {
  const { user, profile, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <Spinner size={8} />
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  if (execOnly && profile?.role === 'member') return <Navigate to="/dashboard" replace />
  return children
}

function AppRoutes() {
  const { user } = useAuth()
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/dashboard"        element={<Dashboard />} />
        <Route path="/segments"         element={<Segments />} />
        <Route path="/segments/:id"     element={<SegmentDetail />} />
        <Route path="/tasks"            element={<Tasks />} />
        <Route path="/notifications"    element={<Notifications />} />
        <Route path="/views"            element={<ProtectedRoute execOnly><Views /></ProtectedRoute>} />
        <Route path="/members"          element={<ProtectedRoute execOnly><Members /></ProtectedRoute>} />
        <Route path="/settings"         element={<ProtectedRoute execOnly><Settings /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
