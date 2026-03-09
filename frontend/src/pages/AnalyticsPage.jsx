import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { analyticsService } from '../services/api'
import { BarChart3, TrendingUp, Users, CheckSquare } from 'lucide-react'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ProgressBar from '../components/common/ProgressBar'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis
} from 'recharts'

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899']

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: <span className="font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30)

  const { data: timelineData, isLoading: tLoading } = useQuery({
    queryKey: ['analytics-timeline', days],
    queryFn: () => analyticsService.tasksOverTime(days).then(r => r.data),
  })

  const { data: deptData, isLoading: dLoading } = useQuery({
    queryKey: ['analytics-departments'],
    queryFn: () => analyticsService.tasksByDepartment().then(r => r.data),
  })

  const { data: productivityData } = useQuery({
    queryKey: ['analytics-productivity'],
    queryFn: () => analyticsService.employeeProductivity().then(r => r.data),
  })

  const { data: priorityData } = useQuery({
    queryKey: ['analytics-priority'],
    queryFn: () => analyticsService.tasksByPriority().then(r => r.data),
  })

  const { data: completionData } = useQuery({
    queryKey: ['analytics-completion'],
    queryFn: () => analyticsService.completionRate().then(r => r.data),
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-indigo-400" />
          Analytics & Reports
        </h1>
        <p className="text-slate-400 text-sm mt-1">Visual insights into company performance</p>
      </div>

      {/* Completion rate banner */}
      {completionData && (
        <div className="card bg-gradient-to-r from-indigo-900/40 to-slate-800">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-slate-400 text-sm">Overall Task Completion Rate</p>
              <p className="text-4xl font-bold text-white mt-1">{completionData.rate}%</p>
              <p className="text-slate-400 text-xs mt-1">
                {completionData.completed} of {completionData.total} tasks completed
              </p>
            </div>
            <div className="w-48">
              <ProgressBar value={completionData.rate} size="lg" showLabel={false} />
            </div>
          </div>
        </div>
      )}

      {/* Tasks over time line chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm">Tasks Over Time</h3>
          <div className="flex gap-2">
            {[7, 14, 30, 60].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  days === d
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        {tLoading ? <LoadingSpinner /> : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={timelineData || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
              <Line type="monotone" dataKey="completed" name="Completed" stroke="#22c55e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="created" name="Created" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Dept tasks + priority charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Department bar chart */}
        <div className="card">
          <h3 className="font-semibold text-sm mb-4">Tasks by Department</h3>
          {dLoading ? <LoadingSpinner /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={deptData || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '10px', color: '#94a3b8' }} />
                <Bar dataKey="completed"   name="Completed"   fill="#22c55e" stackId="a" radius={[0,0,0,0]} />
                <Bar dataKey="in_progress" name="In Progress" fill="#6366f1" stackId="a" />
                <Bar dataKey="pending"     name="Pending"     fill="#f59e0b" stackId="a" />
                <Bar dataKey="delayed"     name="Delayed"     fill="#ef4444" stackId="a" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Priority pie chart */}
        <div className="card">
          <h3 className="font-semibold text-sm mb-4">Tasks by Priority</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={priorityData || []}
                dataKey="count"
                nameKey="priority"
                cx="50%"
                cy="45%"
                outerRadius={80}
                label={({ priority, count }) => `${priority}: ${count}`}
              >
                {(priorityData || []).map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Employee productivity table */}
      {productivityData && productivityData.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-400" />
            Employee Productivity Rankings
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="th">#</th>
                  <th className="th">Employee</th>
                  <th className="th">Department</th>
                  <th className="th">Total Tasks</th>
                  <th className="th">Completed</th>
                  <th className="th">Productivity</th>
                </tr>
              </thead>
              <tbody>
                {productivityData.map((emp, i) => (
                  <tr key={emp.id} className="table-row">
                    <td className="td">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                        ${i === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                          i === 1 ? 'bg-slate-400/20 text-slate-300' :
                          i === 2 ? 'bg-orange-500/20 text-orange-400' :
                          'text-slate-500'}`}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="td font-medium text-slate-200">{emp.name}</td>
                    <td className="td text-slate-400">{emp.department}</td>
                    <td className="td text-center text-slate-300">{emp.total_tasks}</td>
                    <td className="td text-center text-green-400">{emp.completed}</td>
                    <td className="td w-40">
                      <div className="flex items-center gap-2">
                        <ProgressBar value={emp.productivity_score} size="sm" showLabel={false} />
                        <span className="text-xs text-slate-400 w-10">{emp.productivity_score}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
