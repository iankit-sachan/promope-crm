/**
 * AttendancePage — Admin monitoring dashboard.
 *
 * Shows real-time online/away/offline status for all employees,
 * today's login times, work hours, and attendance status.
 * Updates live via the /ws/presence/ WebSocket.
 */
import { useState, useMemo } from 'react'
import { useQuery }           from '@tanstack/react-query'
import {
  Users, Wifi, WifiOff, Clock, CheckCircle2,
  CalendarDays, Search, TrendingUp, AlertCircle,
  Coffee, BarChart3,
} from 'lucide-react'
import { attendanceService }  from '../services/api'
import { usePresenceStore }   from '../store/presenceStore'
import { formatDate }         from '../utils/helpers'
import LoadingSpinner         from '../components/common/LoadingSpinner'
import clsx                   from 'clsx'

// ── helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  online:  { label: 'Online',  dot: 'bg-green-400 animate-pulse', badge: 'bg-green-500/10 text-green-400' },
  away:    { label: 'Away',    dot: 'bg-yellow-400',              badge: 'bg-yellow-500/10 text-yellow-400' },
  offline: { label: 'Offline', dot: 'bg-slate-500',               badge: 'bg-slate-700 text-slate-400' },
}

const ATT_CONFIG = {
  present:  { label: 'Present',  cls: 'text-green-400' },
  late:     { label: 'Late',     cls: 'text-yellow-400' },
  half_day: { label: 'Half Day', cls: 'text-orange-400' },
  absent:   { label: 'Absent',   cls: 'text-red-400' },
}

function StatusDot({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.offline
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${cfg.badge}`}>
        {cfg.label}
      </span>
    </span>
  )
}

function SummaryCard({ icon: Icon, label, value, color, pulse }) {
  const colorMap = {
    green:  'text-green-400 bg-green-500/10',
    yellow: 'text-yellow-400 bg-yellow-500/10',
    slate:  'text-slate-400 bg-slate-700',
    indigo: 'text-indigo-400 bg-indigo-500/10',
    cyan:   'text-cyan-400 bg-cyan-500/10',
  }
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${colorMap[color]}`}>
        <Icon className={`w-5 h-5 ${pulse ? 'animate-pulse' : ''}`} />
      </div>
      <div>
        <p className="text-xl font-bold text-white">{value}</p>
        <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
      </div>
    </div>
  )
}

const TABS = ['all', 'online', 'away', 'offline']

// ── main ──────────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const [tab,    setTab]    = useState('all')
  const [search, setSearch] = useState('')

  // Real-time presence from WebSocket store
  const { employees: wsEmployees, summary: wsSummary, isConnected } = usePresenceStore()

  // REST fallback for initial load (before WS connects)
  const { data: restData, isLoading } = useQuery({
    queryKey: ['presence-dashboard'],
    queryFn:  () => attendanceService.presence().then(r => r.data),
    refetchInterval: 30_000,
    staleTime: 20_000,
  })

  // Prefer live WS data; fall back to REST
  const employees = wsEmployees.length > 0
    ? wsEmployees
    : (restData?.employees || [])

  const summary = wsSummary.total > 0
    ? wsSummary
    : (restData?.summary || { total: 0, online: 0, away: 0, offline: 0, present: 0 })

  // Filter
  const filtered = useMemo(() => {
    let list = employees
    if (tab !== 'all')   list = list.filter(e => e.status === tab)
    if (search.trim())   list = list.filter(e =>
      e.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      e.department?.toLowerCase().includes(search.toLowerCase())
    )
    return list
  }, [employees, tab, search])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-400" />
            Attendance Monitor
          </h1>
          <p className="text-slate-400 text-sm mt-1 flex items-center gap-1.5">
            <span className={clsx('w-2 h-2 rounded-full', isConnected ? 'bg-green-400 animate-pulse' : 'bg-slate-500')} />
            {isConnected ? 'Live updates active' : 'Connecting to live feed…'}
            <span className="text-slate-600">·</span>
            <CalendarDays className="w-3.5 h-3.5" />
            {formatDate(new Date().toISOString().slice(0, 10))}
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <SummaryCard icon={Users}        label="Total"        value={summary.total}   color="indigo" />
        <SummaryCard icon={Wifi}         label="Online"       value={summary.online}  color="green"  pulse />
        <SummaryCard icon={Coffee}       label="Away"         value={summary.away}    color="yellow" />
        <SummaryCard icon={WifiOff}      label="Offline"      value={summary.offline} color="slate"  />
        <SummaryCard icon={CheckCircle2} label="Present Today" value={summary.present} color="cyan"  />
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Tab filter */}
        <div className="flex gap-1 bg-slate-800 p-1 rounded-xl">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-all',
                tab === t
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700',
              )}
            >
              {t}
              {t !== 'all' && (
                <span className="ml-1.5 text-xs opacity-70">
                  {t === 'online' ? summary.online : t === 'away' ? summary.away : summary.offline}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or department…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-9 py-1.5 text-sm w-full"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading && employees.length === 0 ? (
        <LoadingSpinner text="Loading attendance data…" />
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-[11px] uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Employee</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Last Active</th>
                  <th className="px-4 py-3 text-center">Login Time</th>
                  <th className="px-4 py-3 text-center">Logout Time</th>
                  <th className="px-4 py-3 text-center">Hours Today</th>
                  <th className="px-4 py-3 text-center">Attendance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-slate-500">
                      No employees match your filter.
                    </td>
                  </tr>
                ) : (
                  filtered.map(emp => {
                    const attCfg = ATT_CONFIG[emp.attendance_status] || ATT_CONFIG.absent
                    return (
                      <tr key={emp.employee_id} className="hover:bg-slate-700/30 transition-colors">
                        {/* Employee */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="relative shrink-0">
                              {emp.profile_photo ? (
                                <img src={emp.profile_photo} alt=""
                                  className="w-8 h-8 rounded-full object-cover" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">
                                  {(emp.full_name || '?')[0].toUpperCase()}
                                </div>
                              )}
                              {/* Online indicator on avatar */}
                              <span className={clsx(
                                'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-800',
                                emp.status === 'online'  ? 'bg-green-400'  :
                                emp.status === 'away'    ? 'bg-yellow-400' : 'bg-slate-500',
                              )} />
                            </div>
                            <div>
                              <p className="font-medium text-slate-200">{emp.full_name}</p>
                              <p className="text-[11px] text-slate-500">
                                {emp.department || '—'} · {emp.employee_code}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 text-center">
                          <StatusDot status={emp.status} />
                        </td>

                        {/* Last active */}
                        <td className="px-4 py-3 text-center text-slate-400 text-xs">
                          {emp.last_active_display || 'Never'}
                        </td>

                        {/* Login */}
                        <td className="px-4 py-3 text-center text-slate-300 text-xs font-mono">
                          {emp.login_time_str || '—'}
                        </td>

                        {/* Logout */}
                        <td className="px-4 py-3 text-center text-slate-400 text-xs font-mono">
                          {emp.logout_time_str || '—'}
                        </td>

                        {/* Hours */}
                        <td className="px-4 py-3 text-center">
                          {emp.total_work_hours > 0 ? (
                            <span className="text-slate-200 font-medium">
                              {Number(emp.total_work_hours).toFixed(1)}h
                            </span>
                          ) : (
                            <span className="text-slate-600 text-xs">—</span>
                          )}
                        </td>

                        {/* Attendance status */}
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-semibold ${attCfg.cls}`}>
                            {attCfg.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
