import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { employeeService } from '../services/api'
import {
  ArrowLeft, Mail, Phone, MapPin, Calendar, Briefcase,
  CheckSquare, Clock, TrendingUp, Activity, Wifi, WifiOff
} from 'lucide-react'
import { formatDate, timeAgo, getStatusClass, getPriorityClass, statusLabel, initials, verbToLabel } from '../utils/helpers'
import ProgressBar from '../components/common/ProgressBar'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import clsx from 'clsx'

export default function EmployeeProfilePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')

  const { data: employee, isLoading } = useQuery({
    queryKey: ['employee', id],
    queryFn: () => employeeService.get(id).then(r => r.data),
  })

  const { data: activityData } = useQuery({
    queryKey: ['employee-activity', id],
    queryFn: () => employeeService.activity(id).then(r => r.data),
    enabled: activeTab === 'timeline',
  })

  const { data: tasksData } = useQuery({
    queryKey: ['employee-tasks', id],
    queryFn: () => employeeService.tasks(id).then(r => r.data),
    enabled: activeTab === 'tasks',
  })

  if (isLoading) return <LoadingSpinner text="Loading employee profile..." />
  if (!employee) return <div className="text-slate-400 text-center py-20">Employee not found.</div>

  const tasks = tasksData?.results || tasksData || []
  const activities = activityData?.results || activityData || []

  const taskStats = [
    { name: 'Completed', value: employee.tasks_completed, fill: '#22c55e' },
    { name: 'In Progress', value: employee.tasks_in_progress, fill: '#6366f1' },
    { name: 'Pending', value: employee.tasks_pending, fill: '#f59e0b' },
  ]

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Employees
      </button>

      {/* Profile header */}
      <div className="card">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            {employee.profile_photo ? (
              <img
                src={employee.profile_photo}
                alt={employee.full_name}
                className="w-20 h-20 rounded-2xl object-cover"
              />
            ) : (
              <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center text-2xl font-bold text-white">
                {initials(employee.full_name)}
              </div>
            )}
            <span className={clsx(
              'absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-800',
              employee.is_online ? 'bg-green-400' : 'bg-slate-500'
            )} />
          </div>

          {/* Basic info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-white">{employee.full_name}</h1>
                <p className="text-slate-400">{employee.role}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="badge bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    {employee.employee_id}
                  </span>
                  {employee.department && (
                    <span
                      className="badge text-xs"
                      style={{
                        backgroundColor: `${employee.department.color}15`,
                        color: employee.department.color,
                        border: `1px solid ${employee.department.color}30`,
                      }}
                    >
                      {employee.department.name}
                    </span>
                  )}
                  <span className={clsx(
                    'badge',
                    employee.status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'status-delayed'
                  )}>
                    {statusLabel(employee.status)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {employee.is_online ? (
                  <><Wifi className="w-4 h-4 text-green-400" /><span className="text-green-400 text-sm">Online</span></>
                ) : (
                  <><WifiOff className="w-4 h-4 text-slate-500" /><span className="text-slate-500 text-sm">
                    {employee.last_seen ? `Last seen ${timeAgo(employee.last_seen)}` : 'Offline'}
                  </span></>
                )}
              </div>
            </div>

            {/* Contact info */}
            <div className="flex flex-wrap gap-4 mt-3">
              <span className="flex items-center gap-1.5 text-sm text-slate-400">
                <Mail className="w-3.5 h-3.5" />{employee.email}
              </span>
              {employee.phone && (
                <span className="flex items-center gap-1.5 text-sm text-slate-400">
                  <Phone className="w-3.5 h-3.5" />{employee.phone}
                </span>
              )}
              <span className="flex items-center gap-1.5 text-sm text-slate-400">
                <Calendar className="w-3.5 h-3.5" />Joined {formatDate(employee.joining_date)}
              </span>
              {employee.address && (
                <span className="flex items-center gap-1.5 text-sm text-slate-400">
                  <MapPin className="w-3.5 h-3.5" />{employee.address}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Performance metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card text-center">
          <p className="text-2xl font-bold text-white">{employee.tasks_completed}</p>
          <p className="text-xs text-slate-400 mt-1">Tasks Completed</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-indigo-400">{employee.tasks_in_progress}</p>
          <p className="text-xs text-slate-400 mt-1">In Progress</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-yellow-400">{employee.tasks_pending}</p>
          <p className="text-xs text-slate-400 mt-1">Pending</p>
        </div>
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-400">Productivity</p>
            <p className="text-sm font-bold text-white">{employee.productivity_score}%</p>
          </div>
          <ProgressBar value={employee.productivity_score} showLabel={false} />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-700 flex gap-1">
        {['overview', 'tasks', 'timeline'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium capitalize transition-colors',
              activeTab === tab
                ? 'text-indigo-400 border-b-2 border-indigo-400'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            {tab === 'overview' ? 'Overview' : tab === 'tasks' ? 'Task History' : 'Activity Timeline'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card">
            <h3 className="font-semibold text-sm mb-4">Task Distribution</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={taskStats} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fill: '#94a3b8', fontSize: 11 }} width={80} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]}>
                  {taskStats.map((entry, i) => (
                    <Bar key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card">
            <h3 className="font-semibold text-sm mb-4">Employee Details</h3>
            <dl className="space-y-3">
              {[
                ['Employee ID', employee.employee_id],
                ['Department', employee.department?.name || '—'],
                ['Job Title', employee.role],
                ['Status', statusLabel(employee.status)],
                ['Joining Date', formatDate(employee.joining_date)],
                ['Email', employee.email],
                ['Phone', employee.phone || '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <dt className="text-xs text-slate-400">{label}</dt>
                  <dd className="text-xs font-medium text-slate-200">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="th">Task</th>
                <th className="th">Status</th>
                <th className="th">Priority</th>
                <th className="th">Deadline</th>
                <th className="th">Progress</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-slate-500 py-8 text-sm">No tasks yet</td></tr>
              ) : (
                tasks.map(task => (
                  <tr key={task.id} className="table-row cursor-pointer" onClick={() => navigate(`/tasks/${task.id}`)}>
                    <td className="td">
                      <p className="font-medium text-slate-200 truncate max-w-xs">{task.name}</p>
                      <p className="text-xs text-slate-500">{task.task_id}</p>
                    </td>
                    <td className="td"><span className={getStatusClass(task.status)}>{statusLabel(task.status)}</span></td>
                    <td className="td"><span className={getPriorityClass(task.priority)}>{task.priority}</span></td>
                    <td className="td"><span className={task.is_overdue ? 'text-red-400' : 'text-slate-400'}>{formatDate(task.deadline)}</span></td>
                    <td className="td w-32"><ProgressBar value={task.progress} size="sm" /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="card">
          <h3 className="font-semibold text-sm mb-4">Activity Timeline</h3>
          {activities.length === 0 ? (
            <p className="text-slate-500 text-center py-8 text-sm">No activity recorded</p>
          ) : (
            <div className="relative pl-6 space-y-4">
              <div className="absolute left-2 top-0 bottom-0 w-px bg-slate-700" />
              {activities.map((event, i) => (
                <div key={event.id} className="relative fade-in">
                  <div className="absolute -left-4 w-2 h-2 rounded-full bg-indigo-500 mt-1" />
                  <div className="bg-slate-700/30 rounded-lg p-3">
                    <p className="text-sm text-slate-200">{event.description}</p>
                    <p className="text-xs text-slate-500 mt-1">{timeAgo(event.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
