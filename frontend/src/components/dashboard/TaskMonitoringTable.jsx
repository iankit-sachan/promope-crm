import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { taskService, departmentService, employeeService } from '../../services/api'
import { formatDate, getStatusClass, getPriorityClass, statusLabel } from '../../utils/helpers'
import ProgressBar from '../common/ProgressBar'
import LoadingSpinner from '../common/LoadingSpinner'
import { Filter, ExternalLink } from 'lucide-react'

const STATUSES = ['', 'pending', 'in_progress', 'completed', 'delayed']
const PRIORITIES = ['', 'low', 'medium', 'high', 'urgent']

export default function TaskMonitoringTable({ compact = false }) {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    department: '',
    assigned_to: '',
    search: '',
  })
  const [showFilters, setShowFilters] = useState(false)

  const { data: tasksData, isLoading } = useQuery({
    queryKey: ['tasks', filters],
    queryFn: () => taskService.list({
      status: filters.status || undefined,
      priority: filters.priority || undefined,
      department: filters.department || undefined,
      assigned_to: filters.assigned_to || undefined,
      search: filters.search || undefined,
    }).then(r => r.data),
  })

  const { data: deptData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentService.list().then(r => r.data),
  })

  const tasks = tasksData?.results || tasksData || []
  const departments = deptData?.results || deptData || []
  const displayTasks = compact ? tasks.slice(0, 8) : tasks

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm">Task Monitoring</h3>
        <div className="flex items-center gap-2">
          {!compact && (
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="btn-secondary py-1.5 text-xs"
            >
              <Filter className="w-3.5 h-3.5" />
              Filters
            </button>
          )}
          {compact && (
            <button
              onClick={() => navigate('/tasks')}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              View all <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      {showFilters && !compact && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 p-3 bg-slate-700/30 rounded-lg">
          <div>
            <label className="label">Status</label>
            <select
              className="input"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              {STATUSES.map(s => (
                <option key={s} value={s}>{s ? statusLabel(s) : 'All Statuses'}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Priority</label>
            <select
              className="input"
              value={filters.priority}
              onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
            >
              {PRIORITIES.map(p => (
                <option key={p} value={p}>{p || 'All Priorities'}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Department</label>
            <select
              className="input"
              value={filters.department}
              onChange={(e) => setFilters({ ...filters, department: e.target.value })}
            >
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Search</label>
            <input
              type="text"
              className="input"
              placeholder="Task name..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </div>
        </div>
      )}

      {isLoading ? (
        <LoadingSpinner text="Loading tasks..." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="th">Task</th>
                <th className="th">Employee</th>
                <th className="th hidden md:table-cell">Department</th>
                <th className="th">Status</th>
                <th className="th hidden lg:table-cell">Deadline</th>
                <th className="th hidden lg:table-cell">Priority</th>
                <th className="th">Progress</th>
              </tr>
            </thead>
            <tbody>
              {displayTasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-slate-500 py-8 text-sm">
                    No tasks found
                  </td>
                </tr>
              ) : (
                displayTasks.map((task) => (
                  <tr
                    key={task.id}
                    className="table-row cursor-pointer"
                    onClick={() => navigate(`/tasks/${task.id}`)}
                  >
                    <td className="td">
                      <div>
                        <p className="font-medium text-slate-200 truncate max-w-[180px]">{task.name}</p>
                        <p className="text-xs text-slate-500">{task.task_id}</p>
                      </div>
                    </td>
                    <td className="td">
                      <span className="text-slate-300">{task.assigned_to_name || '—'}</span>
                    </td>
                    <td className="td hidden md:table-cell">
                      <span className="text-slate-400">{task.department_name || '—'}</span>
                    </td>
                    <td className="td">
                      <span className={getStatusClass(task.status)}>
                        {statusLabel(task.status)}
                      </span>
                    </td>
                    <td className="td hidden lg:table-cell">
                      <span className={task.is_overdue ? 'text-red-400 font-medium' : 'text-slate-400'}>
                        {task.deadline ? formatDate(task.deadline) : '—'}
                      </span>
                    </td>
                    <td className="td hidden lg:table-cell">
                      <span className={getPriorityClass(task.priority)}>
                        {task.priority}
                      </span>
                    </td>
                    <td className="td w-32">
                      <ProgressBar value={task.progress} size="sm" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
