import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Search, X, Menu } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationService } from '../../services/api'
import { timeAgo } from '../../utils/helpers'
import { useAuthStore } from '../../store/authStore'
import clsx from 'clsx'

export default function TopBar({ onToggleSidebar, sidebarOpen }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showNotifications, setShowNotifications] = useState(false)
  const notifRef = useRef(null)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuthStore()

  // Close notification panel when clicking outside
  useEffect(() => {
    if (!showNotifications) return
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showNotifications])

  // Fetch notifications
  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationService.list().then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: unreadData } = useQuery({
    queryKey: ['notifications-count'],
    queryFn: () => notificationService.unreadCount().then(r => r.data),
    refetchInterval: 15000,
  })

  const markAllMutation = useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-count'] })
    },
  })

  const handleSearch = (e) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/tasks?search=${encodeURIComponent(searchQuery)}`)
      setSearchQuery('')
    }
  }

  const notifications = notifData?.results || notifData || []
  const unreadCount = unreadData?.count || 0

  return (
    <header className="h-16 bg-slate-800/50 border-b border-slate-700 flex items-center px-4 md:px-6 gap-3 flex-shrink-0">
      {/* Hamburger / Close — mobile only */}
      <button
        onClick={onToggleSidebar}
        className="md:hidden p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors flex-shrink-0"
        aria-label="Toggle menu"
      >
        {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks, employees..."
            className="input pl-9 py-2 bg-slate-700/60"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </form>

      <div className="flex items-center gap-3 ml-auto">
        {/* Notification bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-slate-200"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notifications dropdown */}
          {showNotifications && (
            <div className="absolute right-0 top-12 w-72 sm:w-80 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 fade-in">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                <span className="font-semibold text-sm">Notifications</span>
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllMutation.mutate()}
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="text-center text-slate-500 text-sm py-8">No notifications</p>
                ) : (
                  notifications.slice(0, 10).map((notif) => (
                    <div
                      key={notif.id}
                      className={clsx(
                        'px-4 py-3 border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer',
                        !notif.is_read && 'bg-indigo-500/5'
                      )}
                      onClick={() => {
                        if (notif.link) navigate(notif.link)
                        setShowNotifications(false)
                      }}
                    >
                      <div className="flex items-start gap-2">
                        {!notif.is_read && (
                          <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full mt-1.5 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-200 truncate">{notif.title}</p>
                          <p className="text-xs text-slate-400 mt-0.5 truncate">{notif.message}</p>
                          <p className="text-xs text-slate-500 mt-1">{timeAgo(notif.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Current date display */}
        <div className="hidden md:block text-right">
          <p className="text-xs text-slate-400">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
        </div>
      </div>
    </header>
  )
}
