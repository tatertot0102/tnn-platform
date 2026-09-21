import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { NotificationsProvider } from './context/NotificationsContext'
import AppLayout from './components/layout/AppLayout'
import Spinner from './components/ui/Spinner'

// Each page is its own chunk, so the first load only downloads what it shows
// (charts, drag and drop and the chat composer load when first needed).
const Login           = lazy(() => import('./pages/Login'))
const ResetPassword   = lazy(() => import('./pages/ResetPassword'))
const Dashboard       = lazy(() => import('./pages/Dashboard'))
const Segments        = lazy(() => import('./pages/Segments'))
const SegmentDetail   = lazy(() => import('./pages/SegmentDetail'))
const SegmentSubtasks = lazy(() => import('./pages/SegmentSubtasks'))
const Tasks           = lazy(() => import('./pages/Tasks'))
const Views           = lazy(() => import('./pages/Views'))
const Members         = lazy(() => import('./pages/Members'))
const Settings        = lazy(() => import('./pages/Settings'))
const Notifications   = lazy(() => import('./pages/Notifications'))
const Profile         = lazy(() => import('./pages/Profile'))
const Chat            = lazy(() => import('./pages/Chat'))

const FullScreenSpinner = () => (
  <div className="min-h-dvh flex items-center justify-center bg-gray-950"><Spinner size={8} /></div>
)

function ProtectedRoute({ children, execOnly = false, viewsOnly = false }) {
  const { user, profile, loading, isExec, canViewsAccess } = useAuth()
  if (loading) return <FullScreenSpinner />
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
  if (loading) return <FullScreenSpinner />

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Suspense fallback={<FullScreenSpinner />}><Login /></Suspense>} />
      <Route path="/reset-password" element={<Suspense fallback={<FullScreenSpinner />}><ResetPassword /></Suspense>} />
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/dashboard"     element={<Dashboard />} />
        <Route path="/segments"      element={<Segments />} />
        <Route path="/segments/:id"  element={<SegmentDetail />} />
        <Route path="/segments/:id/subtasks" element={<SegmentSubtasks />} />
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
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <NotificationsProvider>
              <AppRoutes />
            </NotificationsProvider>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
