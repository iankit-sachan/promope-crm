import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, CheckSquare, Building2,
  BarChart3, Settings, LogOut, Zap, ChevronRight, ChevronDown,
  ClipboardCheck, FileBarChart2, MonitorDot, CalendarDays, UserCheck, MessageSquare,
  HeartHandshake, Users2, CalendarOff, FileText, Briefcase, BarChart2,
  Wallet, BadgeDollarSign, CreditCard, FileDown, Landmark,
  Activity, BookOpen, ScrollText, Timer,
  Target, UserSearch, Kanban, ClipboardList, Monitor, ShieldCheck,
  User, FolderOpen,
} from 'lucide-react'
import { useChatStore } from '../../store/chatStore'
import { useAuthStore } from '../../store/authStore'
import { authService } from '../../services/api'
import { initials } from '../../utils/helpers'
import { useActivityStore } from '../../store/activityStore'
import toast from 'react-hot-toast'
import clsx from 'clsx'

// ── Navigation Structure ─────────────────────────────────────────────────────
const navConfig = [
  // Top-level (always visible, no group)
  { to: '/dashboard',      label: 'Dashboard',     icon: LayoutDashboard, roles: ['founder','admin','manager','hr','employee'] },
  { to: '/tasks',          label: 'Tasks',          icon: CheckSquare,     roles: ['founder','admin','manager','hr','employee'] },
  { to: '/worklogs',       label: 'Work Log',       icon: ClipboardCheck,  roles: ['founder','admin','manager','hr','employee'] },
  { to: '/chat',           label: 'Messages',       icon: MessageSquare,   roles: ['founder','admin','manager','hr','employee'] },

  // My Stuff
  { group: 'My Stuff', icon: User, roles: ['founder','admin','manager','hr','employee'], defaultOpen: true, children: [
    { to: '/my-attendance',    label: 'My Attendance',  icon: UserCheck,    roles: ['founder','admin','manager','hr','employee'] },
    { to: '/hr/leave',         label: 'Leave Mgmt',     icon: CalendarOff,  roles: ['founder','admin','hr','manager','employee'] },
    { to: '/payslips',         label: 'My Payslips',    icon: FileDown,     roles: ['founder','admin','hr','manager','employee'] },
    { to: '/my-bank-details',  label: 'Bank Details',   icon: Landmark,     roles: ['founder','admin','hr','manager','employee'] },
    { to: '/daily-report',     label: 'Daily Report',   icon: BookOpen,     roles: ['founder','admin','manager','hr','employee'] },
    { to: '/settings',         label: 'Settings',       icon: Settings,     roles: ['founder','admin','manager','hr','employee'] },
  ]},

  // Management
  { group: 'Management', icon: MonitorDot, roles: ['founder','admin','manager','hr'], children: [
    { to: '/employees',      label: 'Employees',      icon: Users,          roles: ['founder','admin','manager','hr'] },
    { to: '/departments',    label: 'Departments',     icon: Building2,      roles: ['founder','admin','manager','hr'] },
    { to: '/attendance',     label: 'Attendance',      icon: CalendarDays,   roles: ['founder','admin','manager'] },
    { to: '/analytics',      label: 'Analytics',       icon: BarChart3,      roles: ['founder','admin','manager'] },
    { to: '/manager',        label: 'Mgr Dashboard',   icon: MonitorDot,     roles: ['founder','admin','manager'] },
    { to: '/reports',        label: 'Reports',         icon: FileBarChart2,  roles: ['founder','admin','manager'] },
  ]},

  // HR Module
  { group: 'HR Module', icon: HeartHandshake, roles: ['founder','admin','hr'], children: [
    { to: '/hr',              label: 'HR Dashboard',    icon: HeartHandshake, roles: ['founder','admin','hr'] },
    { to: '/hr/employees',    label: 'HR Employees',    icon: Users2,         roles: ['founder','admin','hr'] },
    { to: '/hr/attendance',   label: 'HR Attendance',   icon: CalendarDays,   roles: ['founder','admin','hr'] },
    { to: '/hr/documents',    label: 'Documents',       icon: FileText,       roles: ['founder','admin','hr'] },
    { to: '/hr/reports',      label: 'HR Reports',      icon: BarChart2,      roles: ['founder','admin','hr'] },
    { to: '/hr/tasks',        label: 'Task Mgmt',       icon: ClipboardList,  roles: ['founder','admin','hr'] },
  ]},

  // Hiring
  { group: 'Hiring', icon: Target, roles: ['founder','admin','hr'], children: [
    { to: '/hr/hiring',            label: 'Dashboard',     icon: Target,      roles: ['founder','admin','hr'] },
    { to: '/hr/hiring/jobs',       label: 'Job Positions', icon: Briefcase,   roles: ['founder','admin','hr'] },
    { to: '/hr/hiring/candidates', label: 'Candidates',    icon: UserSearch,  roles: ['founder','admin','hr'] },
    { to: '/hr/hiring/pipeline',   label: 'Pipeline',      icon: Kanban,      roles: ['founder','admin','hr'] },
    { to: '/hr/hiring/interviews', label: 'Interviews',    icon: CalendarDays,roles: ['founder','admin','hr'] },
  ]},

  // Payroll
  { group: 'Payroll', icon: Wallet, roles: ['founder','admin','hr'], children: [
    { to: '/hr/payroll',      label: 'Payroll',         icon: Wallet,          roles: ['founder','admin','hr'] },
    { to: '/hr/salary',       label: 'Salary Mgmt',     icon: BadgeDollarSign, roles: ['founder','admin','hr'] },
    { to: '/hr/bank-details', label: 'Bank Details',     icon: CreditCard,      roles: ['founder','admin','hr'] },
  ]},

  // Tracking
  { group: 'Tracking', icon: Activity, roles: ['founder','admin','hr','manager','employee'], children: [
    { to: '/activity-monitor', label: 'Activity Monitor', icon: Activity,   roles: ['founder','admin','hr'] },
    { to: '/activity-logs',    label: 'Activity Logs',    icon: ScrollText, roles: ['founder','admin','manager','hr','employee'] },
    { to: '/time-tracking',    label: 'Time Tracking',    icon: Timer,      roles: ['founder','admin','manager','hr','employee'] },
  ]},

  // Admin only
  { to: '/role-management', label: 'Role Management', icon: ShieldCheck, roles: ['founder'] },
  { to: '/remote-control',  label: 'Remote Control',  icon: Monitor,    roles: ['founder','admin','manager'] },
]

export default function Sidebar({ isOpen, onClose }) {
  const { user, logout } = useAuthStore()
  const { isConnected } = useActivityStore()
  const navigate = useNavigate()
  const role = user?.role || 'employee'

  // Collapsed state per group — default open for groups with defaultOpen: true
  const [collapsed, setCollapsed] = useState(() => {
    const init = {}
    navConfig.forEach((item) => {
      if (item.group) {
        init[item.group] = !item.defaultOpen
      }
    })
    return init
  })

  const toggleGroup = (group) => {
    setCollapsed((prev) => ({ ...prev, [group]: !prev[group] }))
  }

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

  // Filter items by role
  const isVisible = (item) => item.roles?.includes(role)

  return (
    <aside className={clsx(
      'w-60 flex-shrink-0 bg-slate-800 border-r border-slate-700 flex flex-col',
      'fixed top-16 left-0 bottom-0 z-40 transition-transform duration-200 ease-in-out',
      'md:static md:top-auto md:bottom-auto md:inset-auto md:z-auto md:translate-x-0',
      isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
    )}>
      {/* Logo — desktop only */}
      <div className="hidden md:flex h-16 items-center gap-3 px-5 border-b border-slate-700">
        <img src="/logo.png.jpeg" alt="PromoPe" className="h-9 w-auto rounded-full" />
        <p className="font-semibold text-white text-sm">PromoPe</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {navConfig.map((item, idx) => {
          // ── Group header with collapsible children ──
          if (item.group) {
            if (!isVisible(item)) return null
            const visibleChildren = item.children.filter(isVisible)
            if (visibleChildren.length === 0) return null
            const isCollapsed = collapsed[item.group]
            const GroupIcon = item.icon

            return (
              <div key={item.group} className="mt-3 first:mt-0">
                <button
                  onClick={() => toggleGroup(item.group)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <GroupIcon className="w-3.5 h-3.5" />
                  <span className="flex-1 text-left">{item.group}</span>
                  {isCollapsed
                    ? <ChevronRight className="w-3 h-3" />
                    : <ChevronDown className="w-3 h-3" />
                  }
                </button>

                {!isCollapsed && (
                  <div className="mt-0.5 space-y-0.5">
                    {visibleChildren.map((child) => (
                      <SidebarLink key={child.to} item={child} onClose={onClose} chatUnread={chatUnread} />
                    ))}
                  </div>
                )}
              </div>
            )
          }

          // ── Top-level link ──
          if (!isVisible(item)) return null
          return <SidebarLink key={item.to} item={item} onClose={onClose} chatUnread={chatUnread} />
        })}
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

function SidebarLink({ item, onClose, chatUnread }) {
  const { to, label, icon: Icon } = item
  return (
    <NavLink
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
    </NavLink>
  )
}
