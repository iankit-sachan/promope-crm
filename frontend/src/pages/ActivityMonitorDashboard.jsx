/**
 * ActivityMonitorDashboard — real-time employee activity monitoring.
 * Shows live online/away/offline presence, daily report stats, and
 * per-employee productivity summary. Manager+ only.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Users, Wifi, WifiOff, Clock, Activity, BarChart3,
  RefreshCw, Eye, TrendingUp, CheckCircle2, AlertCircle,
  UserCheck, MonitorDot,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from 'recharts'
import { trackingService } from '../services/api'
import { usePresenceStore } from '../store/presenceStore'
import { useActivityStore } from '../store/activityStore'
import { useAuthStore } from '../store/authStore'
import { formatDate, timeAgo, verbToLabel, initials } from '../utils/helpers'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  online:  'bg-green-500',
  away:    'bg-yellow-500',
  idle:    'bg-orange-500',
  offline: 'bg-slate-500',
}

const STATUS_TEXT = {
  online:  'text-green-400',
  away:    'text-yellow-400',
  idle:    'text-orange-400',
  offline: 'text-slate-400',
}

export default function ActivityMonitorDashboard() {
  const { user } = useAuthStore()
  const navigate  = useNavigate()
  const [activeTab, setActiveTab] = useState('live')

  // WebSocket-driven presence data
  const { employees: presenceEmployees, summary: presenceSummary } = usePresenceStore()

  // Live activity feed from WS store
  const { activities } = useActivityStore()

  // REST: productivity stats
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 6)
    return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10))
  const [deptFilter, setDeptFilter] = useState('')

  const { data: productivityData, isLoading: prodLoading, refetch: refetchProd } = useQuery({
    queryKey: ['productivity', dateFrom, dateTo, deptFilter],
    queryFn:  () => trackingService.productivity({ date_from: dateFrom, date_to: dateTo, department: deptFilter || undefined })
      .then(r => r.data),
    refetchInterval: 60000,
  })

  const { data: reportSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ['report-summary', dateFrom, dateTo],
    queryFn:  () => trackingService.reportSummary({ date_from: dateFrom, date_to: dateTo })
      .then(r => r.data),
    refetchInterval: 60000,
  })

  const { data: onlineData, isLoading: onlineLoading, refetch: refetchOnline } = useQuery({
    queryKey: ['online-users'],
    queryFn:  () => trackingService.onlineUsers().then(r => r.data),
    refetchInterval: 30000,
  })

  const employees     = productivityData?.employees || []
  const attendTrend   = productivityData?.attendance_trend || []
  const onlineUsers   = onlineData?.users || []

  const deptChartData = (() => {
    const map = {}
    employees.forEach(e => {
      if (!map[e.department]) map[e.department] = { dept: e.department || 'N/A', total_hours: 0, employees: 0, avg_completion: 0 }
      map[e.department].total_hours    += e.total_hours
      map[e.department].employees      += 1
      map[e.department].avg_completion  = (map[e.department].avg_completion + e.completion_rate) / 2
    })
    return Object.values(map).map(d => ({ ...d, avg_completion: Math.round(d.avg_completion) }))
  })()

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-indigo-400" /> Activity Monitor
          </h1>
          <p className="text-slate-400 text-sm mt-1">Real-time employee activity and productivity tracking</p>
        </div>
        <button onClick={() => { refetchProd(); refetchOnline() }}
          className="btn-secondary flex items-center gap-2 text-sm self-start sm:self-auto">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard icon={<Users className="w-5 h-5"/>} label="Total Employees"
          value={presenceSummary.total || onlineUsers.length || employees.length}
          color="text-indigo-400" bg="bg-indigo-500/10" />
        <StatCard icon={<Wifi className="w-5 h-5"/>} label="Online Now"
          value={presenceSummary.online ?? onlineData?.online_count ?? 0}
          color="text-green-400" bg="bg-green-500/10" />
        <StatCard icon={<Clock className="w-5 h-5"/>} label="Away"
          value={presenceSummary.away ?? onlineData?.away_count ?? 0}
          color="text-yellow-400" bg="bg-yellow-500/10" />
        <StatCard icon={<MonitorDot className="w-5 h-5"/>} label="Idle"
          value={presenceSummary.idle ?? 0}
          color="text-orange-400" bg="bg-orange-500/10" />
        <StatCard icon={<CheckCircle2 className="w-5 h-5"/>} label="Reports Today"
          value={reportSummary?.submitted_today ?? 0}
          sub={`${reportSummary?.pending_review ?? 0} pending review`}
          color="text-blue-400" bg="bg-blue-500/10" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/50 rounded-xl p-1 w-fit">
        {[
          { key: 'live',         label: 'Live Presence' },
          { key: 'productivity', label: 'Productivity' },
          { key: 'feed',         label: 'Activity Feed' },
        ].map(tab => (
          <button key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >{tab.label}</button>
        ))}
      </div>

      {/* Live Presence Tab */}
      {activeTab === 'live' && (
        <div className="space-y-4">
          {/* Online users grid */}
          {onlineLoading ? (
            <div className="card p-8 text-center text-slate-400">Loading presence data…</div>
          ) : onlineUsers.length === 0 ? (
            <div className="card p-8 text-center text-slate-400 flex flex-col items-center gap-2">
              <WifiOff className="w-8 h-8 opacity-50" />
              <p>No active users right now</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {onlineUsers.map(u => (
                <PresenceCard key={u.user_id} user={u} navigate={navigate} />
              ))}
            </div>
          )}

          {/* Also show presence store data if WS is active */}
          {presenceEmployees.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <MonitorDot className="w-4 h-4 text-green-400" /> Live WebSocket Presence
                <span className="ml-auto text-xs text-slate-500">Updates in real-time</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-700">
                      <th className="pb-2 font-medium">Employee</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium hidden sm:table-cell">Last Active</th>
                      <th className="pb-2 font-medium hidden sm:table-cell">Work Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {presenceEmployees.slice(0, 20).map(emp => (
                      <tr key={emp.user_id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                              {initials(emp.full_name || emp.name || '?')}
                            </div>
                            <span className="text-white">{emp.full_name || emp.name}</span>
                          </div>
                        </td>
                        <td className="py-2">
                          <span className={`flex items-center gap-1.5 ${STATUS_TEXT[emp.status] || 'text-slate-400'}`}>
                            <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[emp.status] || 'bg-slate-500'}`} />
                            {emp.status}
                          </span>
                        </td>
                        <td className="py-2 text-slate-400 hidden sm:table-cell">{emp.last_seen_display || timeAgo(emp.last_active)}</td>
                        <td className="py-2 text-slate-300 hidden sm:table-cell">{emp.work_hours ? `${emp.work_hours}h` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Productivity Tab */}
      {activeTab === 'productivity' && (
        <div className="space-y-6">
          {/* Date range */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="label">From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input" />
            </div>
            <button onClick={() => refetchProd()} className="btn-primary text-sm">Apply</button>
          </div>

          {/* Charts row */}
          {!prodLoading && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Dept bar chart */}
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-400" /> Avg Completion Rate by Dept
                </h3>
                <div className="h-40 sm:h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={deptChartData} margin={{ top: 0, right: 10, bottom: 0, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="dept" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} unit="%" />
                      <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} formatter={(v) => [`${v}%`, 'Completion']} />
                      <Bar dataKey="avg_completion" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Attendance trend */}
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-400" /> Daily Attendance Trend
                </h3>
                <div className="h-40 sm:h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={attendTrend} margin={{ top: 0, right: 10, bottom: 0, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
                      <Legend />
                      <Line type="monotone" dataKey="present_count" stroke="#22c55e" name="Present" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Employee productivity table */}
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-slate-700">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-indigo-400" /> Employee Productivity
              </h3>
            </div>
            {prodLoading ? (
              <div className="p-8 text-center text-slate-400">Loading…</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800/50">
                    <tr className="text-left text-slate-400">
                      <th className="px-4 py-3 font-medium">Employee</th>
                      <th className="px-4 py-3 font-medium hidden sm:table-cell">Department</th>
                      <th className="px-4 py-3 font-medium text-center hidden md:table-cell">Reports</th>
                      <th className="px-4 py-3 font-medium text-center hidden md:table-cell">Avg Tasks Done</th>
                      <th className="px-4 py-3 font-medium text-center">Completion %</th>
                      <th className="px-4 py-3 font-medium text-center hidden lg:table-cell">Hours Worked</th>
                      <th className="px-4 py-3 font-medium text-center hidden lg:table-cell">Timer (min)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No data for selected period</td></tr>
                    ) : employees.map(emp => (
                      <tr key={emp.employee_id} className="border-t border-slate-700/50 hover:bg-slate-700/30">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                              {initials(emp.employee_name)}
                            </div>
                            <div>
                              <p className="text-white font-medium">{emp.employee_name}</p>
                              <p className="text-slate-400 text-xs">{emp.employee_code}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-300 hidden sm:table-cell">{emp.department || '—'}</td>
                        <td className="px-4 py-3 text-center text-slate-300 hidden md:table-cell">{emp.reports_submitted}</td>
                        <td className="px-4 py-3 text-center text-slate-300 hidden md:table-cell">{emp.avg_tasks_completed}</td>
                        <td className="px-4 py-3 text-center">
                          <CompletionBadge rate={emp.completion_rate} />
                        </td>
                        <td className="px-4 py-3 text-center text-slate-300 hidden lg:table-cell">{emp.total_hours.toFixed(1)}h</td>
                        <td className="px-4 py-3 text-center text-slate-300 hidden lg:table-cell">{emp.total_timer_minutes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Activity Feed Tab */}
      {activeTab === 'feed' && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-slate-700 flex items-center justify-between">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-400" /> Live Activity Feed
            </h3>
            <span className="text-xs text-slate-400">{activities.length} events in memory</span>
          </div>
          <div className="divide-y divide-slate-700/50 max-h-[600px] overflow-y-auto">
            {activities.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>No activity yet. Events appear here in real-time.</p>
              </div>
            ) : activities.map((act, i) => (
              <div key={act.id || i} className="px-4 py-3 hover:bg-slate-700/30 flex gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-600/30 flex items-center justify-center text-indigo-300 text-xs font-bold flex-shrink-0">
                  {initials(act.actor?.name || '?')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">
                    <span className="font-medium">{act.actor?.name || 'System'}</span>
                    {' '}<span className="text-slate-400">{verbToLabel(act.verb)}</span>
                    {act.target_name && <span className="text-indigo-300"> {act.target_name}</span>}
                  </p>
                  {act.description && <p className="text-xs text-slate-500 truncate">{act.description}</p>}
                </div>
                <span className="text-xs text-slate-500 flex-shrink-0">{timeAgo(act.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, sub, color, bg }) {
  return (
    <div className="card p-4">
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center ${color} mb-3`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-white">{value ?? '—'}</p>
      <p className="text-slate-400 text-sm">{label}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function PresenceCard({ user: u, navigate }) {
  return (
    <div className="card p-4 flex items-start gap-3 hover:border-indigo-500/30 transition-colors cursor-pointer"
      onClick={() => u.employee_id && navigate(`/employees/${u.employee_id}`)}>
      <div className="relative flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold">
          {initials(u.full_name)}
        </div>
        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-800 ${STATUS_COLORS[u.status]}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium truncate">{u.full_name}</p>
        <p className="text-slate-400 text-xs">{u.department || u.role}</p>
        <div className="flex gap-3 mt-1.5 text-xs text-slate-500">
          <span className={STATUS_TEXT[u.status]}>{u.status}</span>
          {u.work_hours > 0 && <span>{u.work_hours.toFixed(1)}h worked</span>}
          {u.login_time && <span>In: {new Date(u.login_time).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</span>}
        </div>
      </div>
      <div className="text-xs text-slate-500 text-right flex-shrink-0">
        {u.last_active_display}
      </div>
    </div>
  )
}

function CompletionBadge({ rate }) {
  const color = rate >= 80 ? 'text-green-400 bg-green-500/10' :
                rate >= 50 ? 'text-yellow-400 bg-yellow-500/10' :
                             'text-red-400 bg-red-500/10'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {rate}%
    </span>
  )
}
