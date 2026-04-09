import { useQuery } from '@tanstack/react-query'
import {
  Users, CheckSquare, Clock, AlertTriangle,
  TrendingUp, Activity, UserCheck, XCircle,
  CalendarDays, LogIn, LogOut, Timer, FileText, AlertCircle,
  Flame, Zap, Wallet, CreditCard, Star, ArrowRight,
} from 'lucide-react'
import { analyticsService, taskService, attendanceService, dailyReportService, payrollService, hrService } from '../services/api'
import { formatCurrency } from '../utils/helpers'
import { Link } from 'react-router-dom'
import StatCard from '../components/common/StatCard'
import LiveActivityFeed from '../components/dashboard/LiveActivityFeed'
import TaskMonitoringTable from '../components/dashboard/TaskMonitoringTable'
import EmployeeActivityTable from '../components/dashboard/EmployeeActivityTable'
import LoadingSpinner from '../components/common/LoadingSpinner'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell, Legend
} from 'recharts'
import { formatDate } from '../utils/helpers'
import { useAuthStore } from '../store/authStore'

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <span className="font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

// ── Employee personal dashboard ────────────────────────────────────────────────

function EmployeeDashboard({ user }) {
  const { data: tasksData } = useQuery({
    queryKey: ['my-tasks'],
    queryFn: () => taskService.list({}).then(r => r.data),
    refetchInterval: 30_000,
  })

  const { data: todayAtt } = useQuery({
    queryKey: ['my-attendance-today'],
    queryFn: () => attendanceService.today().then(r => r.data),
    refetchInterval: 60_000,
  })

  const { data: scoreData } = useQuery({
    queryKey: ['my-att-score'],
    queryFn: () => import('../services/api').then(({ default: api }) =>
      api.get('/attendance/my-score/').then(r => r.data)
    ),
  })

  const { data: payslips } = useQuery({
    queryKey: ['my-payslips-dash'],
    queryFn: () => payrollService.payslipList({}).then(r => {
      const d = r.data
      return Array.isArray(d) ? d : d?.results ?? []
    }),
  })

  const { data: bankData } = useQuery({
    queryKey: ['my-bank-status'],
    queryFn: () => payrollService.bankList({ mine: 'true' }).then(r => {
      const d = r.data
      const list = Array.isArray(d) ? d : d?.results ?? []
      return list[0] || null
    }),
  })

  const { data: leaveData } = useQuery({
    queryKey: ['my-leave-balance'],
    queryFn: () => hrService.leaveBalances({}).then(r => r.data).catch(() => null),
  })

  const tasks    = tasksData?.results || tasksData || []
  const pending  = tasks.filter(t => t.status === 'pending').length
  const inProg   = tasks.filter(t => t.status === 'in_progress').length
  const done     = tasks.filter(t => t.status === 'completed').length
  const overdue  = tasks.filter(t => t.is_overdue).length
  const total    = tasks.length
  const completion = total > 0 ? Math.round((done / total) * 100) : 0

  const streak   = scoreData?.streak
  const score    = scoreData?.month
  const lastPayslip = payslips?.[0]
  const leaveBalances = Array.isArray(leaveData) ? leaveData : leaveData?.results ?? []
  const totalLeave = leaveBalances.reduce((a, b) => a + (b.remaining_days || 0), 0)

  const attStatus = {
    present:  { label: 'Present',  cls: 'text-green-400',  dot: 'bg-green-400' },
    late:     { label: 'Late',     cls: 'text-yellow-400', dot: 'bg-yellow-400' },
    half_day: { label: 'Half Day', cls: 'text-orange-400', dot: 'bg-orange-400' },
    absent:   { label: 'Absent',   cls: 'text-red-400',    dot: 'bg-red-400' },
  }
  const attCfg = attStatus[todayAtt?.status] || attStatus.absent

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          Good {getGreeting()}, {user?.full_name?.split(' ')[0]} 👋
        </h1>
        <p className="text-slate-400 text-sm mt-1 flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5" />
          {formatDate(new Date().toISOString().slice(0, 10))}
          <span className="capitalize ml-2 px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded-full text-xs">{user?.role}</span>
        </p>
      </div>

      {/* Today's Attendance + Streak */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Attendance card */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-indigo-400" />
              Today's Attendance
            </h3>
            {todayAtt ? (
              <span className={`text-xs font-semibold flex items-center gap-1.5 ${attCfg.cls}`}>
                <span className={`w-2 h-2 rounded-full ${attCfg.dot}`} />
                {attCfg.label}
              </span>
            ) : (
              <span className="text-xs text-slate-500">Not checked in</span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 text-slate-400 mb-1">
                <LogIn className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase tracking-wide">Login</span>
              </div>
              <p className="text-base font-bold text-white font-mono">{todayAtt?.login_time_str || '—'}</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 text-slate-400 mb-1">
                <LogOut className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase tracking-wide">Logout</span>
              </div>
              <p className="text-base font-bold text-white font-mono">{todayAtt?.logout_time_str || '—'}</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 text-slate-400 mb-1">
                <Timer className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase tracking-wide">Hours</span>
              </div>
              <p className="text-base font-bold text-indigo-400">
                {todayAtt?.total_work_hours > 0 ? `${Number(todayAtt.total_work_hours).toFixed(1)}h` : '—'}
              </p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 text-slate-400 mb-1">
                <Star className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase tracking-wide">Score</span>
              </div>
              <p className="text-base font-bold text-green-400">{score?.attendance_score ?? '—'}%</p>
            </div>
          </div>
        </div>

        {/* Streak card */}
        <div className="card flex items-center justify-around">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center">
              <Flame className="w-6 h-6 text-orange-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{streak?.current ?? 0}</p>
              <p className="text-[10px] text-slate-400 uppercase">Day Streak</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center">
              <Zap className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{streak?.longest ?? 0}</p>
              <p className="text-[10px] text-slate-400 uppercase">Best Streak</p>
            </div>
          </div>
        </div>
      </div>

      {/* Task stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Pending"     value={pending}    icon={Clock}         color="yellow" />
        <StatCard title="In Progress" value={inProg}     icon={Activity}      color="blue"   />
        <StatCard title="Completed"   value={done}       icon={CheckSquare}   color="green"  />
        <StatCard title="Overdue"     value={overdue}    icon={AlertTriangle} color="red"    subtitle="Past deadline" />
        <StatCard title="Completion"  value={`${completion}%`} icon={TrendingUp} color="indigo" subtitle={`${done}/${total} tasks`} />
      </div>

      {/* Quick Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Last Payslip */}
        <Link to="/payslips" className="card hover:border-indigo-500/30 transition-colors group">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase">Last Payslip</h3>
            <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-indigo-400 transition-colors" />
          </div>
          {lastPayslip ? (
            <>
              <p className="text-xl font-bold text-green-400">{formatCurrency(lastPayslip.net_salary)}</p>
              <p className="text-xs text-slate-500 mt-1">
                {lastPayslip.payment_month && `${['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][lastPayslip.payment_month]} ${lastPayslip.payment_year}`}
                {lastPayslip.payment_status === 'paid' && <span className="ml-2 text-green-400">Paid</span>}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">No payslips yet</p>
          )}
        </Link>

        {/* Bank Details Status */}
        <Link to="/my-bank-details" className="card hover:border-indigo-500/30 transition-colors group">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase">Bank Details</h3>
            <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-indigo-400 transition-colors" />
          </div>
          {bankData ? (
            <>
              <p className="text-sm font-semibold text-slate-200">{bankData.bank_name || '—'}</p>
              <p className="text-xs mt-1">
                {bankData.status === 'approved' && <span className="text-green-400">Approved</span>}
                {bankData.status === 'pending' && <span className="text-yellow-400">Pending Review</span>}
                {bankData.status === 'rejected' && <span className="text-red-400">Rejected</span>}
              </p>
            </>
          ) : (
            <p className="text-sm text-amber-400">Not submitted</p>
          )}
        </Link>

        {/* Leave Balance */}
        <Link to="/hr/leave" className="card hover:border-indigo-500/30 transition-colors group">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase">Leave Balance</h3>
            <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-indigo-400 transition-colors" />
          </div>
          {leaveBalances.length > 0 ? (
            <>
              <p className="text-xl font-bold text-indigo-400">{totalLeave} days</p>
              <p className="text-xs text-slate-500 mt-1">
                {leaveBalances.map(l => `${l.leave_type}: ${l.remaining_days}`).join(' · ')}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">No leave data</p>
          )}
        </Link>
      </div>

      {/* My tasks + activity feed */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <TaskMonitoringTable compact />
        </div>
        <div className="xl:col-span-1" style={{ minHeight: '400px' }}>
          <LiveActivityFeed />
        </div>
      </div>
    </div>
  )
}

// ── Admin / Manager dashboard ──────────────────────────────────────────────────

function AdminDashboard({ user }) {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['analytics-dashboard'],
    queryFn: () => analyticsService.dashboard().then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: timelineData } = useQuery({
    queryKey: ['analytics-timeline'],
    queryFn: () => analyticsService.tasksOverTime(14).then(r => r.data),
    refetchInterval: 60000,
  })

  const { data: deptData } = useQuery({
    queryKey: ['analytics-departments'],
    queryFn: () => analyticsService.tasksByDepartment().then(r => r.data),
  })

  const { data: priorityData } = useQuery({
    queryKey: ['analytics-priority'],
    queryFn: () => analyticsService.tasksByPriority().then(r => r.data),
  })

  const { data: reportAnalytics } = useQuery({
    queryKey: ['daily-report-analytics'],
    queryFn: () => dailyReportService.analytics().then(r => r.data),
    refetchInterval: 60000,
  })

  if (statsLoading) return <LoadingSpinner text="Loading dashboard..." />

  const emp   = stats?.employees || {}
  const tasks = stats?.tasks     || {}

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          Good {getGreeting()}, {user?.full_name?.split(' ')[0]} 👋
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Here's what's happening across your company right now.
        </p>
      </div>

      {/* KPI Stats Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Employees"
          value={emp.total}
          icon={Users}
          color="indigo"
          subtitle={`${emp.inactive} inactive`}
        />
        <StatCard
          title="Active Today"
          value={emp.active_today}
          icon={UserCheck}
          color="green"
          subtitle="Logged in today"
        />
        <StatCard
          title="Active Tasks"
          value={(tasks.in_progress || 0) + (tasks.pending || 0)}
          icon={Activity}
          color="blue"
          subtitle={`${tasks.in_progress} in progress`}
        />
        <StatCard
          title="Completed"
          value={tasks.completed}
          icon={CheckSquare}
          color="green"
          subtitle={`${tasks.completed_this_week} this week`}
        />
      </div>

      {/* KPI Stats Row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Pending Tasks"
          value={tasks.pending}
          icon={Clock}
          color="yellow"
        />
        <StatCard
          title="Delayed Tasks"
          value={tasks.delayed}
          icon={AlertTriangle}
          color="orange"
        />
        <StatCard
          title="Overdue Tasks"
          value={tasks.overdue}
          icon={XCircle}
          color="red"
          subtitle="Past deadline"
        />
        <StatCard
          title="Total Tasks"
          value={tasks.total}
          icon={TrendingUp}
          color="purple"
          subtitle="All time"
        />
      </div>

      {/* Daily Reports Row */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard
          title="Reports Today"
          value={reportAnalytics?.submitted_today ?? '—'}
          icon={FileText}
          color="green"
          subtitle="Submitted today"
        />
        <StatCard
          title="Not Submitted"
          value={reportAnalytics?.not_submitted_today ?? '—'}
          icon={AlertCircle}
          color="orange"
          subtitle="Missing today's report"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Tasks over time */}
        <div className="card lg:col-span-2">
          <h3 className="font-semibold text-sm mb-4">Tasks Over Time (14 days)</h3>
          <div className="h-40 sm:h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timelineData || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                <Line
                  type="monotone"
                  dataKey="completed"
                  name="Completed"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="created"
                  name="Created"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tasks by priority pie */}
        <div className="card">
          <h3 className="font-semibold text-sm mb-4">Tasks by Priority</h3>
          <div className="h-40 sm:h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={priorityData || []}
                  dataKey="count"
                  nameKey="priority"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  label={({ priority, count }) => `${priority}: ${count}`}
                  labelLine={false}
                >
                  {(priorityData || []).map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Department tasks bar chart */}
      {deptData && deptData.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-sm mb-4">Tasks by Department</h3>
          <div className="h-40 sm:h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                <Bar dataKey="pending"     name="Pending"     fill="#f59e0b" radius={[2,2,0,0]} />
                <Bar dataKey="in_progress" name="In Progress" fill="#6366f1" radius={[2,2,0,0]} />
                <Bar dataKey="completed"   name="Completed"   fill="#22c55e" radius={[2,2,0,0]} />
                <Bar dataKey="delayed"     name="Delayed"     fill="#ef4444" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Bottom section: Activity Feed + Task Table */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Live activity feed */}
        <div className="xl:col-span-1" style={{ minHeight: '400px' }}>
          <LiveActivityFeed />
        </div>

        {/* Task monitoring compact */}
        <div className="xl:col-span-2">
          <TaskMonitoringTable compact />
        </div>
      </div>

      {/* Employee activity table */}
      <EmployeeActivityTable compact />
    </div>
  )
}

// ── Page entry point ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuthStore()

  if (user?.role === 'employee') {
    return <EmployeeDashboard user={user} />
  }

  return <AdminDashboard user={user} />
}
