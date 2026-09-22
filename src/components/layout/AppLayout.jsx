import { Suspense } from 'react'
import { Outlet, useLocation, useMatch } from 'react-router-dom'
import Sidebar from './Sidebar'
import { PageSkeleton } from '../ui/Skeleton'

export default function AppLayout() {
  const location = useLocation()
  // Full-screen workspaces use the whole width instead of the centred column.
  const isFullBleed = !!useMatch('/segments/:id/subtasks')
  // Chat pins itself to the viewport, so it skips the padded column and the
  // page-in wrapper: a transformed ancestor would trap its fixed positioning.
  const isViewportPage = !!useMatch('/chat')

  return (
    <div className="flex min-h-dvh bg-gray-950">
      <Sidebar />
      <main className="flex-1 min-w-0 md:ml-56 min-h-dvh">
        {isViewportPage ? (
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        ) : (
          <div className={`${isFullBleed ? 'max-w-none' : 'max-w-7xl'} mx-auto px-4 md:px-8 pt-[calc(4.5rem+env(safe-area-inset-top))] md:pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]`}>
            <Suspense fallback={<PageSkeleton />}>
              <div key={location.pathname} className="animate-page-in">
                <Outlet />
              </div>
            </Suspense>
          </div>
        )}
      </main>
    </div>
  )
}
