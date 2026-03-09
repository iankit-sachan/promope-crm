/**
 * HR Task Management Page
 * Allows HR to create, assign, edit and delete tasks for employees.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList, Plus, X, Edit2, Trash2,
  AlertTriangle, CheckSquare, Clock, Activity,
  Search, Filter,
} from 'lucide-react'
import { hrService, employeeService, departmentService } from '../../services/api'
import StatCard from '../../components/common/StatCard'
import { formatDate } from '../../utils/helpers'
import clsx from 'clsx'
import toast from 'react-hot-toast'

const PRIORITIES = ['low', 'medium', 'high', 'urgent']
const STATUSES   = ['pending', 'in_progress', 'completed', 'delayed']

const priorityColor = {
  low:    'text-slate-400  bg-slate-500/10  border-slate-500/30',
  medium: 'text-blue-400   bg-blue-500/10   border-blue-500/30',
  high:   'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  urgent: 'text-red-400    bg-red-500/10    border-red-500/30',
}

const statusColor = {
  pending:     'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  in_progress: 'text-blue-400   bg-blue-500/10   border-blue-500/30',
  completed:   'text-green-400  bg-green-500/10  border-green-500/30',
  delayed:     'text-red-400    bg-red-500/10    border-red-500/30',
}

// ── Task Form Modal ────────────────────────────────────────────────────────────

function TaskModal({ task, employees, departments, onClose, onSubmit, loading }) {
  const isEdit = !!task
  const [form, setForm] = useState({
    name:        task?.name        || '',
    description: task?.description || '',
    assigned_to: task?.assigned_to || '',
    department:  task?.department  || '',
    priority:    task?.priority    || 'medium',
    status:      task?.status      || 'pending',
    deadline:    task?.deadline    || '',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Task title is required'); return }
    const payload = { ...form }
    if (!payload.assigned_to) delete payload.assigned_to
    if (!payload.department)  delete payload.department
    if (!payload.deadline)    delete payload.deadline
    onSubmit(payload)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h3 className="font-semibold text-slate-200 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-indigo-400" />
            {isEdit ? 'Edit Task' : 'Assign New Task'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Task Title *</label>
            <input
              className="input w-full"
              placeholder="e.g. Complete Q1 report"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Description</label>
            <textarea
              className="input w-full min-h-[80px] resize-none"
              placeholder="Task details..."
              value={form.description}
              onChange={e => set('description', e.target.value)}
            />
          </div>

          {/* Assign To + Department */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Assign To</label>
              <select
                className="input w-full"
                value={form.assigned_to}
                onChange={e => set('assigned_to', e.target.value)}
              >
                <option value="">— Unassigned —</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Department</label>
              <select
                className="input w-full"
                value={form.department}
                onChange={e => set('department', e.target.value)}
              >
                <option value="">— None —</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Priority + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Priority</label>
              <select className="input w-full" value={form.priority} onChange={e => set('priority', e.target.value)}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Status</label>
              <select className="input w-full" value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
              </select>
            </div>
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Deadline</label>
            <input
              type="date"
              className="input w-full"
              value={form.deadline}
              onChange={e => set('deadline', e.target.value)}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Assign Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function HRTaskManagementPage() {
  const qc = useQueryClient()

  // Filters
  const [filters, setFilters] = useState({ status: '', priority: '', department: '', employee: '', search: '' })
  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }))
  const clearFilters = () => setFilters({ status: '', priority: '', department: '', employee: '', search: '' })
  const activeFilters = Object.values(filters).some(Boolean)

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editTask, setEditTask]   = useState(null)

  // Data queries
  const { data: stats } = useQuery({
    queryKey: ['hr-task-stats'],
    queryFn: () => hrService.taskStats().then(r => r.data),
  })

  const { data: tasksData, isLoading } = useQuery({
    queryKey: ['hr-tasks', filters],
    queryFn: () => hrService.taskList(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
    ).then(r => r.data),
  })

  const { data: employeesData } = useQuery({
    queryKey: ['employees-minimal'],
    queryFn: () => employeeService.list({ page_size: 200 }).then(r => r.data),
  })

  const { data: deptsData } = useQuery({
    queryKey: ['departments-minimal'],
    queryFn: () => departmentService.list().then(r => r.data),
  })

  const tasks       = tasksData?.results || tasksData || []
  const employees   = employeesData?.results || employeesData || []
  const departments = deptsData?.results || deptsData || []

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data) => hrService.taskCreate(data),
    onSuccess: () => {
      toast.success('Task assigned successfully')
      qc.invalidateQueries({ queryKey: ['hr-tasks'] })
      qc.invalidateQueries({ queryKey: ['hr-task-stats'] })
      setShowModal(false)
    },
    onError: (err) => toast.error(err?.response?.data?.detail || 'Failed to create task'),
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => hrService.taskUpdate(id, data),
    onSuccess: () => {
      toast.success('Task updated')
      qc.invalidateQueries({ queryKey: ['hr-tasks'] })
      qc.invalidateQueries({ queryKey: ['hr-task-stats'] })
      setEditTask(null)
    },
    onError: (err) => toast.error(err?.response?.data?.detail || 'Failed to update task'),
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id) => hrService.taskDelete(id),
    onSuccess: () => {
      toast.success('Task deleted')
      qc.invalidateQueries({ queryKey: ['hr-tasks'] })
      qc.invalidateQueries({ queryKey: ['hr-task-stats'] })
    },
    onError: () => toast.error('Failed to delete task'),
  })

  const handleDelete = (task) => {
    if (!window.confirm(`Delete task "${task.name}"? This cannot be undone.`)) return
    deleteMutation.mutate(task.id)
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-indigo-400" />
            HR Task Management
          </h1>
          <p className="text-slate-400 text-sm mt-1">Create and assign tasks to employees</p>
        </div>
        <button
          onClick={() => { setEditTask(null); setShowModal(true) }}
          className="btn-primary flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Assign Task
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Tasks"      value={stats?.total       ?? '—'} icon={ClipboardList} color="indigo" />
        <StatCard title="Assigned Today"   value={stats?.assigned_today ?? '—'} icon={Activity}  color="blue"   />
        <StatCard title="Overdue"          value={stats?.overdue     ?? '—'} icon={AlertTriangle} color="red"    />
        <StatCard title="Completed"        value={stats?.completed   ?? '—'} icon={CheckSquare}  color="green"  />
      </div>

      {/* Filter bar */}
      <div className="card">
        <div className="flex flex-wrap gap-3 items-center">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              className="input pl-8 w-44 text-sm"
              placeholder="Search tasks…"
              value={filters.search}
              onChange={e => setFilter('search', e.target.value)}
            />
          </div>

          <select className="input text-sm w-36" value={filters.status} onChange={e => setFilter('status', e.target.value)}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
          </select>

          <select className="input text-sm w-32" value={filters.priority} onChange={e => setFilter('priority', e.target.value)}>
            <option value="">All Priorities</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>

          <select className="input text-sm w-40" value={filters.department} onChange={e => setFilter('department', e.target.value)}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          <select className="input text-sm w-44" value={filters.employee} onChange={e => setFilter('employee', e.target.value)}>
            <option value="">All Employees</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>

          {activeFilters && (
            <button onClick={clearFilters} className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Task table */}
      <div className="card overflow-x-auto">
        {isLoading ? (
          <div className="py-12 text-center text-slate-500 text-sm">Loading tasks…</div>
        ) : tasks.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            {activeFilters ? 'No tasks match the current filters.' : 'No tasks yet. Click "Assign Task" to get started.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="th">Task</th>
                <th className="th hidden md:table-cell">Assigned To</th>
                <th className="th hidden lg:table-cell">Department</th>
                <th className="th">Priority</th>
                <th className="th">Status</th>
                <th className="th hidden lg:table-cell">Deadline</th>
                <th className="th hidden xl:table-cell">Created</th>
                <th className="th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(task => {
                const isOverdue = task.deadline && task.deadline < today &&
                  ['pending', 'in_progress'].includes(task.status)
                return (
                  <tr key={task.id} className="table-row">
                    <td className="td">
                      <p className="font-medium text-slate-200 truncate max-w-[180px]">{task.name}</p>
                      <p className="text-[10px] text-slate-500">{task.task_id}</p>
                    </td>
                    <td className="td hidden md:table-cell">
                      <span className="text-slate-300">{task.assigned_to_name || '—'}</span>
                    </td>
                    <td className="td hidden lg:table-cell">
                      <span className="text-slate-400">{task.department_name || '—'}</span>
                    </td>
                    <td className="td">
                      <span className={clsx('badge text-[10px] border', priorityColor[task.priority])}>
                        {task.priority}
                      </span>
                    </td>
                    <td className="td">
                      <span className={clsx('badge text-[10px] border', statusColor[task.status])}>
                        {task.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="td hidden lg:table-cell">
                      {task.deadline ? (
                        <span className={clsx('text-xs', isOverdue ? 'text-red-400 font-semibold' : 'text-slate-400')}>
                          {formatDate(task.deadline)}
                          {isOverdue && ' ⚠'}
                        </span>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="td hidden xl:table-cell">
                      <span className="text-slate-500 text-xs">{formatDate(task.created_at?.slice(0, 10))}</span>
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditTask(task)}
                          className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-indigo-400 transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(task)}
                          className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-red-400 transition-colors"
                          title="Delete"
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* In-progress / pending mini stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Pending',     value: stats.pending,     icon: Clock,    cls: 'text-yellow-400' },
            { label: 'In Progress', value: stats.in_progress, icon: Activity, cls: 'text-blue-400'   },
            { label: 'Overdue',     value: stats.overdue,     icon: AlertTriangle, cls: 'text-red-400' },
          ].map(({ label, value, icon: Icon, cls }) => (
            <div key={label} className="card flex items-center gap-3">
              <Icon className={clsx('w-5 h-5 shrink-0', cls)} />
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
                <p className={clsx('text-xl font-bold', cls)}>{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Assign / Edit Modal */}
      {(showModal || editTask) && (
        <TaskModal
          task={editTask}
          employees={employees}
          departments={departments}
          onClose={() => { setShowModal(false); setEditTask(null) }}
          onSubmit={(data) => {
            if (editTask) {
              updateMutation.mutate({ id: editTask.id, data })
            } else {
              createMutation.mutate(data)
            }
          }}
          loading={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  )
}
