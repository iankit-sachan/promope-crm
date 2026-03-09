/**
 * Manager Monitoring Dashboard
 * Shows: daily overview, 7-day trend chart, weekly leaderboard,
 *        employee productivity bar chart, pending-task owners.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts'
import {
  Users, CheckSquare, Clock, TrendingUp,
  AlertTriangle, Trophy, CalendarDays, ClipboardList,
} from 'lucide-react'
import { reportService, taskService } from '../services/api'
import { formatDate } from '../utils/helpers'
import LoadingSpinner from '../components/common/LoadingSpinner'

// ── helpers ───────────────────────────────────────────────────────────────────

const toISO = (d) => d.toISOString().slice(0, 10)
const thisMonday = () => {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1))
  return toISO(d)
}

const RANK_COLORS = ['#f59e0b', '#94a3b8', '#b45309', '#6366f1', '#22c55e']
const BAR_COLORS  = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
                     '#06b6d4', '#ec4899', '#84cc16']

// ── stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color = 'indigo' }) {
  const colors = {
    indigo: 'bg-indigo-500/10 text-indigo-400',
    green:  'bg-green-500/10  text-green-400',
    yellow: 'bg-yellow-500/10 text-yellow-400',
    red:    'bg-red-500/10    text-red-400',
  }
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${colors[color]}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-slate-400 text-xs uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function ManagerDashboardPage() {
  const navigate = useNavigate()
  const today = toISO(new Date())
  const [reportDate, setReportDate] = useState(today)

  // Daily report
  const { data: daily, isLoading: loadingDaily } = useQuery({
    queryKey: ['report-daily', reportDate],
    queryFn:  () => reportService.daily({ date: reportDate }).then(r => r.data),
  })

  // Weekly leaderboard
  const { data: weekly, isLoading: loadingWeekly } = useQuery({
    queryKey: ['report-weekly', thisMonday()],
    queryFn:  () => reportService.weekly({ week_start: thisMonday() }).then(r => r.data),
  })

  // 7-day trend line chart
  const { data: trend } = useQuery({
    queryKey: ['report-trend-7'],
    queryFn:  () => reportService.trend({ days: 7 }).then(r => r.data),
    initialData: [],
  })

  // Pending tasks (for the "attention needed" widget)
  const { data: pendingTasks } = useQuery({
    queryKey: ['tasks-pending-blocked'],
    queryFn:  () => taskService.list({ status: 'pending', page_size: 5 }).then(r => r.data),
  })

  const dailyEmployees = daily?.employee_reports || []
  const weeklyEmployees = weekly?.employee_reports || []
  const pendingList = pendingTasks?.results || pendingTasks || []

  // Chart data: employee productivity from daily report
  const productivityData = dailyEmployees.map(e => ({
    name:       e.employee_name.split(' ')[0],
    completion: e.completion_rate,
    hours:      e.hours_worked,
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-indigo-400" />
            Manager Dashboard
          </h1>
          <p className="text-slate-400 text-sm mt-1">Monitor team productivity and daily progress</p>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-slate-400" />
          <input
            type="date"
            className="input w-40 text-sm"
            value={reportDate}
            onChange={e => setReportDate(e.target.value)}
          />
        </div>
      </div>

      {/* KPI row */}
      {loadingDaily ? (
        <LoadingSpinner text="Loading report..." />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Users}    label="Employees Active"
            value={daily?.total_employees ?? '—'}
            sub={`${daily?.employees_logged ?? 0} submitted logs`}
            color="indigo"
          />
          <StatCard
            icon={CheckSquare} label="Tasks Completed"
            value={daily?.total_tasks_completed ?? '—'}
            sub={`of ${daily?.total_tasks_assigned ?? 0} assigned`}
            color="green"
          />
          <StatCard
            icon={TrendingUp}  label="Completion Rate"
            value={`${daily?.overall_completion_rate ?? 0}%`}
            sub="Today's team average"
            color="yellow"
          />
          <StatCard
            icon={Clock}       label="Total Hours"
            value={daily?.total_hours_worked ?? '—'}
            sub="Team hours worked today"
            color="indigo"
          />
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Employee productivity bar chart */}
        <div className="card">
          <h2 className="font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <BarChart className="w-4 h-4 text-indigo-400" />
            Employee Completion Rate — {formatDate(reportDate)}
          </h2>
          {productivityData.length === 0 ? (
            <p className="text-slate-500 text-sm py-8 text-center">No data for selected date</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={productivityData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} domain={[0, 100]} unit="%" />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  labelStyle={{ color: '#e2e8f0' }}
                  formatter={v => [`${v}%`, 'Completion']}
                />
                <Bar dataKey="completion" radius={[4, 4, 0, 0]}>
                  {productivityData.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 7-day task completion trend */}
        <div className="card">
          <h2 className="font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-400" />
            7-Day Task Completion Trend
          </h2>
          {trend.length === 0 ? (
            <p className="text-slate-500 text-sm py-8 text-center">Loading trend…</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="day_label" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                <Line
                  type="monotone" dataKey="tasks_completed" name="Completed"
                  stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone" dataKey="logs_submitted" name="Logs Submitted"
                  stroke="#6366f1" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Bottom row: leaderboard + daily table + pending tasks */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Weekly leaderboard */}
        <div className="card xl:col-span-1">
          <h2 className="font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-400" />
            Weekly Leaderboard
          </h2>
          {loadingWeekly ? (
            <LoadingSpinner />
          ) : weeklyEmployees.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-4">No data this week</p>
          ) : (
            <ol className="space-y-2">
              {weeklyEmployees.slice(0, 7).map((emp, i) => (
                <li
                  key={emp.employee_id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/40 cursor-pointer transition-colors"
                  onClick={() => navigate(`/employees/${emp.employee_id}`)}
                >
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ backgroundColor: `${RANK_COLORS[i] || '#6366f1'}20`, color: RANK_COLORS[i] || '#6366f1' }}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{emp.employee_name}</p>
                    <p className="text-[10px] text-slate-500">{emp.department || 'No dept'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-indigo-400">{emp.productivity_score}%</p>
                    <p className="text-[10px] text-slate-500">{emp.total_tasks_completed}✓</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Daily employee status table */}
        <div className="card xl:col-span-2 overflow-x-auto">
          <h2 className="font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-400" />
            Today's Employee Status
          </h2>
          {loadingDaily ? (
            <LoadingSpinner />
          ) : dailyEmployees.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-4">No employees found</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="th text-left">Employee</th>
                  <th className="th">Assigned</th>
                  <th className="th">Done</th>
                  <th className="th">Pending</th>
                  <th className="th">Hours</th>
                  <th className="th">Rate</th>
                  <th className="th">Log</th>
                </tr>
              </thead>
              <tbody>
                {dailyEmployees.map(emp => (
                  <tr
                    key={emp.employee_id}
                    className="table-row cursor-pointer"
                    onClick={() => navigate(`/employees/${emp.employee_id}`)}
                  >
                    <td className="td">
                      <p className="font-medium text-slate-200 truncate max-w-[130px]">{emp.employee_name}</p>
                      <p className="text-[10px] text-slate-500">{emp.department || '—'}</p>
                    </td>
                    <td className="td text-center text-slate-300">{emp.tasks_assigned_count}</td>
                    <td className="td text-center text-green-400 font-semibold">{emp.tasks_completed_count}</td>
                    <td className="td text-center text-yellow-400">{emp.tasks_pending_count}</td>
                    <td className="td text-center text-slate-300">{emp.hours_worked}h</td>
                    <td className="td text-center">
                      <span className={`text-xs font-semibold ${
                        emp.completion_rate >= 70 ? 'text-green-400' :
                        emp.completion_rate >= 40 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {emp.completion_rate}%
                      </span>
                    </td>
                    <td className="td text-center">
                      <span className={`badge text-[10px] ${
                        emp.log_submitted ? 'status-completed' : 'status-pending'
                      }`}>
                        {emp.log_submitted ? 'Submitted' : 'Missing'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Attention needed — tasks without logs */}
      <div className="card">
        <h2 className="font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-400" />
          Pending Tasks — Needs Attention
        </h2>
        {pendingList.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-4">No pending tasks 🎉</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingList.map(task => (
              <div
                key={task.id}
                className="flex items-start gap-3 p-3 bg-slate-700/40 rounded-xl hover:bg-slate-700/60 cursor-pointer transition-colors"
                onClick={() => navigate(`/tasks/${task.id}`)}
              >
                <span className={`badge shrink-0 text-[10px] mt-0.5 priority-${task.priority}`}>
                  {task.priority}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{task.name}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {task.assigned_to_name || 'Unassigned'} · {task.deadline ? formatDate(task.deadline) : 'No deadline'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
