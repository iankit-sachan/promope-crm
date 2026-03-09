import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, Filter, CheckSquare } from 'lucide-react'
import { taskService, departmentService, employeeService } from '../services/api'
import { formatDate, getStatusClass, getPriorityClass, statusLabel, timeAgo } from '../utils/helpers'
import ProgressBar from '../components/common/ProgressBar'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { useAuthStore } from '../store/authStore'

const STATUSES = ['', 'pending', 'in_progress', 'completed', 'delayed', 'cancelled']
const PRIORITIES = ['', 'low', 'medium', 'high', 'urgent']

export default function TasksPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuthStore()
  const [showFilters, setShowFilters] = useState(false)

  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    department: '',
    assigned_to: '',
    search: searchParams.get('search') || '',
  })

  const { data, isLoading } = useQuery({
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

  const { data: empData } = useQuery({
    queryKey: ['employees-minimal'],
    queryFn: () => employeeService.list({ page_size: 100 }).then(r => r.data),
    enabled: user?.role !== 'employee',
  })

  const tasks = data?.results || data || []
  const departments = deptData?.results || deptData || []
  const employees = empData?.results || empData || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-indigo-400" />
            Tasks
          </h1>
          <p className="text-slate-400 text-sm mt-1">{tasks.length} tasks found</p>
        </div>
        {user?.role !== 'employee' && (
          <button onClick={() => navigate('/tasks/add')} className="btn-primary">
            <Plus className="w-4 h-4" />
            Create Task
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card space-y-3">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search tasks..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="btn-secondary"
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-slate-700">
            <div>
              <label className="label">Status</label>
              <select className="input" value={filters.status}
                onChange={e => setFilters({...filters, status: e.target.value})}>
                {STATUSES.map(s => <option key={s} value={s}>{s ? statusLabel(s) : 'All Statuses'}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="input" value={filters.priority}
                onChange={e => setFilters({...filters, priority: e.target.value})}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p || 'All Priorities'}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Department</label>
              <select className="input" value={filters.department}
                onChange={e => setFilters({...filters, department: e.target.value})}>
                <option value="">All Departments</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            {user?.role !== 'employee' && (
              <div>
                <label className="label">Employee</label>
                <select className="input" value={filters.assigned_to}
                  onChange={e => setFilters({...filters, assigned_to: e.target.value})}>
                  <option value="">All Employees</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Task table */}
      {isLoading ? (
        <LoadingSpinner text="Loading tasks..." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="th">Task</th>
                <th className="th hidden sm:table-cell">Assigned To</th>
                <th className="th hidden md:table-cell">Department</th>
                <th className="th">Status</th>
                <th className="th hidden md:table-cell">Deadline</th>
                <th className="th hidden lg:table-cell">Priority</th>
                <th className="th">Progress</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-slate-500 py-12 text-sm">
                    <CheckSquare className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    No tasks match your filters
                  </td>
                </tr>
              ) : (
                tasks.map((task) => (
                  <tr key={task.id} className="table-row cursor-pointer"
                    onClick={() => navigate(`/tasks/${task.id}`)}>
                    <td className="td">
                      <p className="font-medium text-slate-200 max-w-[200px] truncate">{task.name}</p>
                      <p className="text-xs text-slate-500">{task.task_id}</p>
                    </td>
                    <td className="td hidden sm:table-cell text-slate-400">{task.assigned_to_name || '—'}</td>
                    <td className="td hidden md:table-cell text-slate-400">{task.department_name || '—'}</td>
                    <td className="td">
                      <span className={getStatusClass(task.status)}>{statusLabel(task.status)}</span>
                    </td>
                    <td className="td hidden md:table-cell">
                      <span className={task.is_overdue ? 'text-red-400 text-sm font-medium' : 'text-slate-400 text-sm'}>
                        {task.deadline ? formatDate(task.deadline) : '—'}
                      </span>
                    </td>
                    <td className="td hidden lg:table-cell">
                      <span className={getPriorityClass(task.priority)}>{task.priority}</span>
                    </td>
                    <td className="td w-36">
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
