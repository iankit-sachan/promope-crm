import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { useActivityFeed } from '../../hooks/useWebSocket'
import { usePresence }     from '../../hooks/usePresence'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Initialize WS connection at layout level so it persists across pages
  useActivityFeed()
  // Start presence tracking (online/away/offline) for real-time monitoring
  usePresence()

  return (
    <div className="flex h-screen bg-slate-900 overflow-hidden">
      {/* Mobile backdrop — covers content area only (below TopBar), closes sidebar on tap */}
      {sidebarOpen && (
        <div
          className="fixed top-16 inset-x-0 bottom-0 bg-black/50 z-30 md:hidden cursor-pointer"
          onClick={() => setSidebarOpen(false)}
          onTouchEnd={(e) => { e.preventDefault(); setSidebarOpen(false) }}
          aria-label="Close menu"
          role="button"
        />
      )}

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(o => !o)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
