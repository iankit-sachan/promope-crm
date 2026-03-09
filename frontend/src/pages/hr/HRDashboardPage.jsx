import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Users, UserCheck, CalendarOff, Clock, TrendingUp,
  Briefcase, UserPlus, AlertCircle,
} from 'lucide-react'
import { hrService } from '../../services/api'
import StatCard from '../../components/common/StatCard'

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

const LEAVE_TYPE_COLORS = {
  sick: '#ef4444',
  casual: '#6366f1',
  paid: '#22c55e',
  emergency: '#f59e0b',
}

export default function HRDashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['hr-dashboard'],
    queryFn: () => hrService.dashboard().then(r => r.data),
    staleTime: 60000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-slate-400">Failed to load HR Dashboard</p>
      </div>
    )
  }

  const leaveDistData = (data?.leave_type_distribution || []).map(item => ({
    name: item.leave_type.charAt(0).toUpperCase() + item.leave_type.slice(1),
    value: item.count,
    fill: LEAVE_TYPE_COLORS[item.leave_type] || '#6366f1',
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">HR Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Human Resources overview and analytics</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Total Employees"
          value={data?.total_employees ?? 0}
          icon={Users}
          color="indigo"
        />
        <StatCard
          title="Active"
          value={data?.active_employees ?? 0}
          icon={UserCheck}
          color="green"
          subtitle={`${data?.inactive_employees ?? 0} inactive`}
        />
        <StatCard
          title="On Leave Today"
          value={data?.on_leave_today ?? 0}
          icon={CalendarOff}
          color="yellow"
        />
        <StatCard
          title="Pending Leave"
          value={data?.pending_leave_requests ?? 0}
          icon={Clock}
          color="orange"
        />
        <StatCard
          title="Attendance Rate"
          value={`${data?.monthly_attendance_rate ?? 0}%`}
          icon={TrendingUp}
          color="blue"
          subtitle="This month"
        />
        <StatCard
          title="Open Positions"
          value={data?.open_positions ?? 0}
          icon={Briefcase}
          color="purple"
          subtitle={`${data?.new_hires_this_month ?? 0} hired this month`}
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Department headcount */}
        <div className="card">
          <h2 className="text-base font-semibold mb-4">Department Headcount</h2>
          {data?.department_headcount?.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.department_headcount} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Bar dataKey="count" name="Employees" radius={[4, 4, 0, 0]}>
                  {data.department_headcount.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-500 text-sm text-center py-10">No department data</p>
          )}
        </div>

        {/* Leave distribution */}
        <div className="card">
          <h2 className="text-base font-semibold mb-4">Leave Type Distribution (This Year)</h2>
          {leaveDistData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={leaveDistData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {leaveDistData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{v}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-500 text-sm text-center py-10">No approved leaves this year</p>
          )}
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Attendance trend */}
        <div className="card">
          <h2 className="text-base font-semibold mb-4">Monthly Attendance Trend</h2>
          {data?.monthly_attendance_trend?.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart
                data={data.monthly_attendance_trend}
                margin={{ top: 4, right: 8, left: -20, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickFormatter={v => `${v}%`} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  formatter={v => [`${v}%`, 'Attendance Rate']}
                />
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ fill: '#6366f1', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-500 text-sm text-center py-10">No attendance data</p>
          )}
        </div>

        {/* Quick stats card */}
        <div className="card">
          <h2 className="text-base font-semibold mb-4">Quick Summary</h2>
          <div className="space-y-3">
            <SummaryRow
              icon={<UserPlus className="w-4 h-4 text-green-400" />}
              label="New Hires This Month"
              value={data?.new_hires_this_month ?? 0}
              color="text-green-400"
            />
            <SummaryRow
              icon={<CalendarOff className="w-4 h-4 text-yellow-400" />}
              label="On Leave Today"
              value={data?.on_leave_today ?? 0}
              color="text-yellow-400"
            />
            <SummaryRow
              icon={<Clock className="w-4 h-4 text-orange-400" />}
              label="Pending Leave Requests"
              value={data?.pending_leave_requests ?? 0}
              color="text-orange-400"
            />
            <SummaryRow
              icon={<Briefcase className="w-4 h-4 text-purple-400" />}
              label="Open Job Positions"
              value={data?.open_positions ?? 0}
              color="text-purple-400"
            />
            <SummaryRow
              icon={<Users className="w-4 h-4 text-slate-400" />}
              label="Inactive Employees"
              value={data?.inactive_employees ?? 0}
              color="text-slate-400"
            />
            <div className="pt-2 border-t border-slate-700/50">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-sm">Monthly Attendance Rate</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${data?.monthly_attendance_rate ?? 0}%` }}
                    />
                  </div>
                  <span className="text-indigo-400 text-sm font-semibold">
                    {data?.monthly_attendance_rate ?? 0}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryRow({ icon, label, value, color }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-slate-300 text-sm">{label}</span>
      </div>
      <span className={`text-lg font-bold ${color}`}>{value}</span>
    </div>
  )
}
