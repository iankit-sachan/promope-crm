/**
 * useActivityTracker
 *
 * Automatically logs page visits to the backend whenever the user navigates
 * to a new route. Uses a debounce so rapid client-side navigations don't
 * flood the API.
 *
 * Usage: call once inside App.jsx (or a top-level layout component):
 *   useActivityTracker()
 */

import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { trackingService } from '../services/api'
import { useAuthStore } from '../store/authStore'

// Map of path prefixes → human-readable page titles
const PAGE_TITLE_MAP = {
  '/dashboard':          'Dashboard',
  '/tasks':              'Tasks',
  '/employees':          'Employees',
  '/departments':        'Departments',
  '/analytics':          'Analytics',
  '/attendance':         'Attendance',
  '/worklogs':           'Work Logs',
  '/chat':               'Chat',
  '/notifications':      'Notifications',
  '/profile':            'Profile',
  '/hr/payroll':         'Payroll Dashboard',
  '/hr/salary':          'Salary Management',
  '/hr/bank-details':    'Bank Details',
  '/hr/leaves':          'Leave Management',
  '/hr/documents':       'HR Documents',
  '/hr/recruitment':     'Recruitment',
  '/payslips':           'My Payslips',
  '/activity-monitor':   'Activity Monitor',
  '/daily-report':       'Daily Report',
  '/activity-logs':      'Activity Logs',
  '/time-tracking':      'Time Tracking',
  '/settings':           'Settings',
}

function getPageTitle(pathname) {
  // Exact match first
  if (PAGE_TITLE_MAP[pathname]) return PAGE_TITLE_MAP[pathname]
  // Prefix match (longest prefix wins)
  const match = Object.keys(PAGE_TITLE_MAP)
    .filter(k => pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0]
  return match ? PAGE_TITLE_MAP[match] : pathname
}

export function useActivityTracker() {
  const location   = useLocation()
  const { user, isAuthenticated } = useAuthStore()
  const timerRef   = useRef(null)
  const lastPath   = useRef(null)

  useEffect(() => {
    if (!isAuthenticated || !user) return

    const pathname = location.pathname

    // Skip duplicate navigations
    if (pathname === lastPath.current) return
    lastPath.current = pathname

    // Skip auth pages
    if (pathname.startsWith('/login') || pathname.startsWith('/register')) return

    // Debounce: wait 1 second before logging (avoids logging intermediate routes)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const title = getPageTitle(pathname)
      trackingService.logPageVisit({ page: pathname, page_title: title }).catch(() => {
        // Silently ignore errors — page visit tracking is best-effort
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [location.pathname, isAuthenticated, user])
}
