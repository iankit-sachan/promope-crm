import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, CheckSquare, Building2,
  BarChart3, Settings, LogOut, Zap, ChevronRight,
  ClipboardCheck, FileBarChart2, MonitorDot, CalendarDays, UserCheck, MessageSquare,
  HeartHandshake, Users2, CalendarOff, FileText, Briefcase, BarChart2,
  Wallet, BadgeDollarSign, CreditCard, FileDown,
  Activity, BookOpen, ScrollText, Timer,
  Target, UserSearch, Kanban, ClipboardList, Monitor, X, ShieldCheck,
} from 'lucide-react'
import { useChatStore } from '../../store/chatStore'
import { useAuthStore } from '../../store/authStore'
import { authService } from '../../services/api'
import { initials } from '../../utils/helpers'
import { useActivityStore } from '../../store/activityStore'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const navItems = [
  { to: '/dashboard',      label: 'Dashboard',     icon: LayoutDashboard, roles: ['founder','admin','manager','hr','employee'] },
  { to: '/employees',      label: 'Employees',     icon: Users,           roles: ['founder','admin','manager'] },
  { to: '/role-management', label: 'Role Management', icon: ShieldCheck,   roles: ['founder'] },
  { to: '/tasks',          label: 'Tasks',          icon: CheckSquare,     roles: ['founder','admin','manager','hr','employee'] },
  { to: '/worklogs',       label: 'Work Log',       icon: ClipboardCheck,  roles: ['founder','admin','manager','hr','employee'] },
  { to: '/chat',           label: 'Messages',       icon: MessageSquare,   roles: ['founder','admin','manager','hr','employee'] },
  { to: '/attendance',     label: 'Attendance',     icon: CalendarDays,    roles: ['founder','admin','manager'] },
  { to: '/my-attendance',  label: 'My Attendance',  icon: UserCheck,       roles: ['founder','admin','manager','hr','employee'] },
  { to: '/departments',    label: 'Departments',    icon: Building2,       roles: ['founder','admin','manager'] },
  { to: '/analytics',      label: 'Analytics',      icon: BarChart3,       roles: ['founder','admin','manager'] },
  { to: '/manager',        label: 'Mgr Dashboard',  icon: MonitorDot,      roles: ['founder','admin','manager'] },
  { to: '/reports',        label: 'Reports',        icon: FileBarChart2,   roles: ['founder','admin','manager'] },
  // ── HR Module ──────────────────────────────────────────────────────────
  { to: '/hr',             label: 'HR Dashboard',   icon: HeartHandshake,  roles: ['founder','admin','hr'] },
  { to: '/hr/employees',   label: 'HR Employees',   icon: Users2,          roles: ['founder','admin','hr'] },
  { to: '/hr/leave',       label: 'Leave Mgmt',     icon: CalendarOff,     roles: ['founder','admin','hr','manager','employee'] },
  { to: '/hr/attendance',  label: 'HR Attendance',  icon: CalendarDays,    roles: ['founder','admin','hr'] },
  { to: '/hr/documents',   label: 'Documents',      icon: FileText,        roles: ['founder','admin','hr'] },
  { to: '/hr/reports',     label: 'HR Reports',     icon: BarChart2,       roles: ['founder','admin','hr'] },
  { to: '/hr/tasks',       label: 'Task Management', icon: ClipboardList,  roles: ['founder','admin','hr'] },
  { to: '/hr/hiring',            label: 'Hiring',        icon: Target,      roles: ['founder','admin','hr'] },
  { to: '/hr/hiring/jobs',       label: 'Job Positions', icon: Briefcase,   roles: ['founder','admin','hr'] },
  { to: '/hr/hiring/candidates', label: 'Candidates',    icon: UserSearch,  roles: ['founder','admin','hr'] },
  { to: '/hr/hiring/pipeline',   label: 'Pipeline',      icon: Kanban,      roles: ['founder','admin','hr'] },
  { to: '/hr/hiring/interviews', label: 'Interviews',    icon: CalendarDays,roles: ['founder','admin','hr'] },

  // ── Payroll module ────────────────────────────────────────────────────────
  { to: '/hr/payroll',      label: 'Payroll',        icon: Wallet,           roles: ['founder','admin','hr'] },
  { to: '/hr/salary',       label: 'Salary Mgmt',    icon: BadgeDollarSign,  roles: ['founder','admin','hr'] },
  { to: '/hr/bank-details', label: 'Bank Details',   icon: CreditCard,       roles: ['founder','admin','hr'] },
  { to: '/payslips',        label: 'My Payslips',    icon: FileDown,         roles: ['founder','admin','hr','manager','employee'] },

  // ── Remote Control ────────────────────────────────────────────────────────
  { to: '/remote-control',   label: 'Remote Control',   icon: Monitor,   roles: ['founder','admin','manager'] },

  // ── Activity Tracking module ────────────────────────────────────────────────
  { to: '/activity-monitor', label: 'Activity Monitor', icon: Activity,     roles: ['founder','admin','hr'] },
  { to: '/daily-report',     label: 'Daily Report',     icon: BookOpen,     roles: ['founder','admin','manager','hr','employee'] },
  { to: '/activity-logs',    label: 'Activity Logs',    icon: ScrollText,   roles: ['founder','admin','manager','hr','employee'] },
  { to: '/time-tracking',    label: 'Time Tracking',    icon: Timer,        roles: ['founder','admin','manager','hr','employee'] },

  { to: '/settings',       label: 'Settings',        icon: Settings,         roles: ['founder','admin','manager','hr','employee'] },
]

export default function Sidebar({ isOpen, onClose }) {
  const { user, logout, refreshToken } = useAuthStore()
  const { isConnected } = useActivityStore()
  const navigate = useNavigate()

  // Chat unread badge
  const chatUnread = useChatStore((s) =>
    s.conversations.reduce((a, c) => a + (c.unread_count || 0), 0) +
    s.groups.reduce((a, g) => a + (g.unread_count || 0), 0)
  )

  const handleLogout = async () => {
    try {
      const token = useAuthStore.getState().refreshToken
      await authService.logout(token)
    } catch (_) {}
    logout()
    navigate('/login')
    toast.success('Logged out')
  }

  const visibleItems = navItems.filter((item) =>
    item.roles.includes(user?.role || 'employee')
  )

  return (
    <aside className={clsx(
      'w-60 flex-shrink-0 bg-slate-800 border-r border-slate-700 flex flex-col',
      // Mobile: fixed drawer below the TopBar (top-16 = 64px), slides in/out
      'fixed top-16 left-0 bottom-0 z-40 transition-transform duration-200 ease-in-out',
      // Desktop: static (part of flex layout), reset all fixed-position overrides
      'md:static md:top-auto md:bottom-auto md:inset-auto md:z-auto md:translate-x-0',
      isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
    )}>
      {/* Logo — desktop only (TopBar already shows branding on mobile) */}
      <div className="hidden md:flex h-16 items-center gap-3 px-5 border-b border-slate-700">
        <img src="/logo.png.jpeg" alt="PromoPe" className="h-9 w-auto rounded-full" />
        <p className="font-semibold text-white text-sm">PromoPe</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {visibleItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              clsx('nav-item', isActive && 'active')
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{label}</span>
            {to === '/chat' && chatUnread > 0 && (
              <span className="w-4 h-4 rounded-full bg-indigo-500 text-white text-[10px] flex items-center justify-center shrink-0">
                {chatUnread > 9 ? '9+' : chatUnread}
              </span>
            )}
            <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100" />
          </NavLink>
        ))}
      </nav>

      {/* Live indicator */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700/30">
          <span className={clsx(
            'w-2 h-2 rounded-full',
            isConnected ? 'bg-green-400 pulse-dot' : 'bg-slate-500'
          )} />
          <span className="text-xs text-slate-400">
            {isConnected ? 'Live Feed Active' : 'Connecting...'}
          </span>
        </div>
      </div>

      {/* User profile */}
      <div className="px-3 py-3 border-t border-slate-700">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
            {initials(user?.full_name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-200 truncate">{user?.full_name}</p>
            <p className="text-xs text-slate-400 capitalize">{user?.role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 hover:bg-slate-600 rounded-lg transition-colors text-slate-400 hover:text-red-400"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
