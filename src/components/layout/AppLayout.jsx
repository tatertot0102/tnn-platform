import Sidebar from './Sidebar'
import { Outlet } from 'react-router-dom'

export default function AppLayout() {
  return (
    <div className="flex min-h-screen bg-gray-950">
      <Sidebar />
      <main className="flex-1 md:ml-56 min-h-screen overflow-auto">
        <div className="max-w-7xl mx-auto px-4 md:px-8 pt-20 md:pt-8 pb-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
