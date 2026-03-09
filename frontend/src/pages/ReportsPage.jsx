/**
 * ReportsPage — Daily / Weekly / Monthly work log reports for managers.
 * Tabs switch between the three report types; each has its own date picker.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3, Calendar, Clock, CheckCircle2, TrendingUp,
  Users, ChevronLeft, ChevronRight,
} from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from 'recharts'
import { reportService } from '../services/api'
import { formatDate } from '../utils/helpers'
import LoadingSpinner from '../components/common/LoadingSpinner'
import clsx from 'clsx'

// ── helpers ───────────────────────────────────────────────────────────────────

const today = new Date().toISOString().slice(0, 10)

function toMonday(dateStr) {
  const d = new Date(dateStr)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function addDays(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function toYearMonth(dateStr) {
  return dateStr.slice(0, 7)           // "YYYY-MM"
}

const BAR_COLORS = [
  '#6366f1', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#14b8a6',
]

// ── sub-components ────────────────────────────────────────────────────────────

function StatPill({ icon: Icon, label, value, color = 'text-indigo-400' }) {
  return (
    <div className="card flex items-center gap-3 py-3">
      <Icon className={`w-5 h-5 ${color} shrink-0`} />
      <div>
        <p className="text-lg font-bold text-white">{value ?? '—'}</p>
        <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
      </div>
    </div>
  )
}

function StatusBadge({ submitted }) {
  return submitted
    ? <span className="badge status-completed text-[10px]">Submitted</span>
    : <span className="badge status-pending   text-[10px]">Pending</span>
}

function ProdBar({ value }) {
  const pct = Math.min(value ?? 0, 100)
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-300 w-10 text-right">{pct.toFixed(0)}%</span>
    </div>
  )
}

// ── Daily tab ─────────────────────────────────────────────────────────────────

function DailyReport() {
  const [date, setDate] = useState(today)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['report-daily', date],
    queryFn:  () => reportService.daily({ date }).then(r => r.data),
  })

  // Backend returns employee_reports at root level (not nested under "employees")
  const employees = data?.employee_reports || []

  return (
    <div className="space-y-5">
      {/* Date picker */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setDate(addDays(date, -1))}
          className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <input
          type="date"
          value={date}
          max={today}
          onChange={e => setDate(e.target.value)}
          className="input py-1.5 text-sm w-40"
        />
        <button
          onClick={() => setDate(addDays(date, 1))}
          disabled={date >= today}
          className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors disabled:opacity-40"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <span className="text-slate-400 text-sm">{formatDate(date)}</span>
      </div>

      {isLoading && <LoadingSpinner text="Loading daily report…" />}
      {isError   && <p className="text-red-400 text-sm">Failed to load report.</p>}

      {!isLoading && !isError && (
        <>
          {/* Summary pills — fields live at root level of response */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatPill icon={Users}        label="Employees"      value={data?.total_employees}        color="text-indigo-400" />
            <StatPill icon={CheckCircle2} label="Logs Filed"     value={data?.employees_logged}       color="text-green-400" />
            <StatPill icon={Clock}        label="Total Hours"    value={data?.total_hours_worked != null ? `${data.total_hours_worked}h` : '—'} color="text-cyan-400" />
            <StatPill icon={TrendingUp}   label="Avg Completion" value={data?.overall_completion_rate != null ? `${data.overall_completion_rate}%` : '—'} color="text-purple-400" />
          </div>

          {/* Employee table */}
          <div className="card overflow-hidden p-0">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <h3 className="font-semibold text-slate-200 text-sm">Employee Status</h3>
              <span className="text-xs text-slate-500">{employees.length} records</span>
            </div>
            {employees.length === 0 ? (
              <p className="py-8 text-center text-slate-500 text-sm">No data for this date.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400 text-[11px] uppercase tracking-wide">
                      <th className="px-4 py-2 text-left">Employee</th>
                      <th className="px-4 py-2 text-center">Hours</th>
                      <th className="px-4 py-2 text-center">Worked On</th>
                      <th className="px-4 py-2 text-center">Completed</th>
                      <th className="px-4 py-2 text-center">Blocked</th>
                      <th className="px-4 py-2 text-center">Rate</th>
                      <th className="px-4 py-2 text-center">Log</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {employees.map(emp => (
                      <tr key={emp.employee_id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-slate-200">{emp.employee_name}</p>
                          <p className="text-[11px] text-slate-500">{emp.department || '—'}</p>
                        </td>
                        <td className="px-4 py-2.5 text-center text-slate-300">{emp.hours_worked ?? '—'}</td>
                        <td className="px-4 py-2.5 text-center text-slate-300">{emp.tasks_assigned_count ?? '—'}</td>
                        <td className="px-4 py-2.5 text-center text-green-400 font-medium">{emp.tasks_completed_count ?? '—'}</td>
                        <td className="px-4 py-2.5 text-center text-red-400">{emp.tasks_blocked_count ?? '—'}</td>
                        <td className="px-4 py-2.5 min-w-[120px]">
                          <ProdBar value={emp.completion_rate} />
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <StatusBadge submitted={emp.log_submitted} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Hours bar chart */}
          {employees.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-slate-200 text-sm mb-4">Hours Worked</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={employees.map(e => ({ name: e.employee_name.split(' ')[0], hours: e.hours_worked }))}
                  margin={{ top: 0, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                    labelStyle={{ color: '#e2e8f0' }}
                  />
                  <Bar dataKey="hours" name="Hours" radius={[4, 4, 0, 0]}>
                    {employees.map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Weekly tab ────────────────────────────────────────────────────────────────

function WeeklyReport() {
  const [weekStart, setWeekStart] = useState(() => toMonday(today))

  const weekEnd = addDays(weekStart, 6)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['report-weekly', weekStart],
    queryFn:  () => reportService.weekly({ week_start: weekStart }).then(r => r.data),
  })

  // Backend returns employee_reports at root level; compute summary locally
  const employees = data?.employee_reports || []
  const totalCompleted  = employees.reduce((s, e) => s + (e.total_tasks_completed || 0), 0)
  const totalHours      = employees.reduce((s, e) => s + (e.total_hours_worked || 0), 0)
  const avgProductivity = employees.length
    ? Math.round(employees.reduce((s, e) => s + (e.productivity_score || 0), 0) / employees.length)
    : 0

  const prevWeek = () => setWeekStart(addDays(weekStart, -7))
  const nextWeek = () => { if (weekStart < toMonday(today)) setWeekStart(addDays(weekStart, 7)) }

  return (
    <div className="space-y-5">
      {/* Week navigator */}
      <div className="flex items-center gap-3">
        <button onClick={prevWeek} className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-slate-300 text-sm font-medium px-2">
          {formatDate(weekStart)} — {formatDate(weekEnd)}
        </span>
        <button
          onClick={nextWeek}
          disabled={weekStart >= toMonday(today)}
          className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors disabled:opacity-40"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <input
          type="date"
          value={weekStart}
          max={toMonday(today)}
          onChange={e => setWeekStart(toMonday(e.target.value))}
          className="input py-1.5 text-sm w-40 ml-1"
        />
      </div>

      {isLoading && <LoadingSpinner text="Loading weekly report…" />}
      {isError   && <p className="text-red-400 text-sm">Failed to load report.</p>}

      {!isLoading && !isError && (
        <>
          {/* Summary pills — computed from employees array */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatPill icon={Users}        label="Employees"    value={employees.length}                          color="text-indigo-400" />
            <StatPill icon={CheckCircle2} label="Total Done"   value={totalCompleted}                            color="text-green-400" />
            <StatPill icon={Clock}        label="Total Hours"  value={`${totalHours.toFixed(1)}h`}               color="text-cyan-400" />
            <StatPill icon={TrendingUp}   label="Avg Score"    value={`${avgProductivity}%`}                     color="text-purple-400" />
          </div>

          {/* Employee table */}
          <div className="card overflow-hidden p-0">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <h3 className="font-semibold text-slate-200 text-sm">Weekly Breakdown</h3>
              <span className="text-xs text-slate-500">{employees.length} employees</span>
            </div>
            {employees.length === 0 ? (
              <p className="py-8 text-center text-slate-500 text-sm">No data for this week.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400 text-[11px] uppercase tracking-wide">
                      <th className="px-4 py-2 text-left">Employee</th>
                      <th className="px-4 py-2 text-center">Days Logged</th>
                      <th className="px-4 py-2 text-center">Hours</th>
                      <th className="px-4 py-2 text-center">Tasks Done</th>
                      <th className="px-4 py-2 text-center">Completion</th>
                      <th className="px-4 py-2 text-center">Productivity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {employees.map((emp, idx) => (
                      <tr key={emp.employee_id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className={clsx(
                              'w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0',
                              idx === 0 ? 'bg-yellow-500 text-slate-900'
                                : idx === 1 ? 'bg-slate-400 text-slate-900'
                                : idx === 2 ? 'bg-amber-700 text-white'
                                : 'bg-slate-700 text-slate-300'
                            )}>{idx + 1}</span>
                            <div>
                              <p className="font-medium text-slate-200">{emp.employee_name}</p>
                              <p className="text-[11px] text-slate-500">{emp.department || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center text-slate-300">{emp.days_logged ?? '—'}</td>
                        <td className="px-4 py-2.5 text-center text-slate-300">
                          {emp.total_hours_worked != null ? `${emp.total_hours_worked}h` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-center text-green-400 font-medium">{emp.total_tasks_completed ?? '—'}</td>
                        <td className="px-4 py-2.5 min-w-[120px]">
                          <ProdBar value={emp.completion_rate} />
                        </td>
                        <td className="px-4 py-2.5 min-w-[120px]">
                          <ProdBar value={emp.productivity_score} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Productivity bar chart */}
          {employees.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-slate-200 text-sm mb-4">Productivity Score</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={employees.map(e => ({
                    name:  e.employee_name.split(' ')[0],
                    score: e.productivity_score ?? 0,
                    _raw:  e.productivity_score ?? 0,
                  }))}
                  margin={{ top: 0, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                    labelStyle={{ color: '#e2e8f0' }}
                  />
                  <Bar dataKey="score" name="Score" radius={[4, 4, 0, 0]}>
                    {employees.map((emp, i) => {
                      const score = emp.productivity_score ?? 0
                      const fill = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'
                      return <Cell key={i} fill={fill} />
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Monthly tab ───────────────────────────────────────────────────────────────

function MonthlyReport() {
  const [month, setMonth] = useState(() => toYearMonth(today))

  // Split "YYYY-MM" into separate month + year params the backend expects
  const [yearStr, monthStr] = month.split('-')
  const monthNum = parseInt(monthStr, 10)
  const yearNum  = parseInt(yearStr,  10)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['report-monthly', month],
    queryFn:  () => reportService.monthly({ month: monthNum, year: yearNum }).then(r => r.data),
  })

  // Trend data for line chart (last 30 days)
  const { data: trendData = [] } = useQuery({
    queryKey: ['report-trend-30', month],
    queryFn:  () => reportService.trend({ days: 30 }).then(r => r.data),
  })

  // Backend returns employee_reports at root level; compute summary locally
  const employees       = data?.employee_reports || []
  const totalCompleted  = employees.reduce((s, e) => s + (e.total_tasks_completed || 0), 0)
  const avgDailyHours   = employees.length
    ? (employees.reduce((s, e) => s + (e.avg_daily_hours || 0), 0) / employees.length).toFixed(1)
    : '0'
  const avgProductivity = employees.length
    ? Math.round(employees.reduce((s, e) => s + (e.productivity_score || 0), 0) / employees.length)
    : 0

  const prevMonth = () => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const nextMonth = () => {
    const cur = toYearMonth(today)
    if (month >= cur) return
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const monthLabel = new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-5">
      {/* Month navigator */}
      <div className="flex items-center gap-3">
        <button onClick={prevMonth} className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-slate-300 text-sm font-medium px-2 min-w-[130px] text-center">{monthLabel}</span>
        <button
          onClick={nextMonth}
          disabled={month >= toYearMonth(today)}
          className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors disabled:opacity-40"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <input
          type="month"
          value={month}
          max={toYearMonth(today)}
          onChange={e => setMonth(e.target.value)}
          className="input py-1.5 text-sm w-40 ml-1"
        />
      </div>

      {isLoading && <LoadingSpinner text="Loading monthly report…" />}
      {isError   && <p className="text-red-400 text-sm">Failed to load report.</p>}

      {!isLoading && !isError && (
        <>
          {/* Summary pills — computed from employees array */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatPill icon={Users}        label="Employees"     value={employees.length}                       color="text-indigo-400" />
            <StatPill icon={CheckCircle2} label="Total Done"    value={totalCompleted}                         color="text-green-400" />
            <StatPill icon={Clock}        label="Avg Hours/Day" value={`${avgDailyHours}h`}                    color="text-cyan-400" />
            <StatPill icon={TrendingUp}   label="Avg Score"     value={`${avgProductivity}%`}                  color="text-purple-400" />
          </div>

          {/* 30-day trend line chart */}
          {trendData.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-slate-200 text-sm mb-4">30-Day Completion Trend</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="day_label" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                    labelStyle={{ color: '#e2e8f0' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="tasks_completed" name="Completed" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="logs_submitted"  name="Logs Filed" stroke="#6366f1" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Employee table */}
          <div className="card overflow-hidden p-0">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <h3 className="font-semibold text-slate-200 text-sm">Monthly Summary — {data?.month_name} {data?.year}</h3>
              <span className="text-xs text-slate-500">{data?.working_days} working days · {employees.length} employees</span>
            </div>
            {employees.length === 0 ? (
              <p className="py-8 text-center text-slate-500 text-sm">No data for this month.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400 text-[11px] uppercase tracking-wide">
                      <th className="px-4 py-2 text-left">Employee</th>
                      <th className="px-4 py-2 text-center">Days Logged</th>
                      <th className="px-4 py-2 text-center">Total Hours</th>
                      <th className="px-4 py-2 text-center">Tasks Done</th>
                      <th className="px-4 py-2 text-center">Attendance</th>
                      <th className="px-4 py-2 text-center">Completion</th>
                      <th className="px-4 py-2 text-center">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {employees.map((emp, idx) => (
                      <tr key={emp.employee_id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {idx < 3 && (
                              <span className={clsx(
                                'w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0',
                                idx === 0 ? 'bg-yellow-500 text-slate-900'
                                  : idx === 1 ? 'bg-slate-400 text-slate-900'
                                  : 'bg-amber-700 text-white'
                              )}>{idx + 1}</span>
                            )}
                            <div>
                              <p className="font-medium text-slate-200">{emp.employee_name}</p>
                              <p className="text-[11px] text-slate-500">{emp.department || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center text-slate-300">{emp.days_logged ?? '—'}</td>
                        <td className="px-4 py-2.5 text-center text-slate-300">
                          {emp.total_hours_worked != null ? `${emp.total_hours_worked}h` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-center text-green-400 font-medium">{emp.total_tasks_completed ?? '—'}</td>
                        <td className="px-4 py-2.5 text-center">
                          {emp.attendance_rate != null
                            ? <span className={emp.attendance_rate >= 80 ? 'text-green-400' : 'text-yellow-400'}>{emp.attendance_rate}%</span>
                            : '—'}
                        </td>
                        <td className="px-4 py-2.5 min-w-[110px]">
                          <ProdBar value={emp.completion_rate} />
                        </td>
                        <td className="px-4 py-2.5 min-w-[110px]">
                          <ProdBar value={emp.productivity_score} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'daily',   label: 'Daily',   icon: Calendar  },
  { id: 'weekly',  label: 'Weekly',  icon: BarChart3  },
  { id: 'monthly', label: 'Monthly', icon: TrendingUp },
]

export default function ReportsPage() {
  const [tab, setTab] = useState('daily')

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-indigo-400" />
          Work Log Reports
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Aggregate employee productivity across time periods
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800 p-1 rounded-xl w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              tab === id
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700',
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'daily'   && <DailyReport   />}
      {tab === 'weekly'  && <WeeklyReport  />}
      {tab === 'monthly' && <MonthlyReport />}
    </div>
  )
}
