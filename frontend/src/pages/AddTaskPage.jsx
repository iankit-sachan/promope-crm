import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckSquare, ArrowLeft, AlertCircle } from 'lucide-react'
import { taskService, departmentService, employeeService } from '../services/api'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'

const INITIAL_FORM = {
  name: '',
  description: '',
  assigned_to: '',
  department: '',
  priority: 'medium',
  status: 'pending',
  start_date: '',
  deadline: '',
  progress: 0,
}

const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' }
const STATUS_LABELS   = { pending: 'Pending', in_progress: 'In Progress', completed: 'Completed', delayed: 'Delayed' }

export default function AddTaskPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const [form, setForm] = useState(INITIAL_FORM)
  const [errors, setErrors] = useState({})

  const { data: deptData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentService.list().then(r => r.data),
  })

  const { data: empData } = useQuery({
    queryKey: ['employees-minimal'],
    queryFn: () => employeeService.list({ page_size: 100 }).then(r => r.data),
    enabled: user?.role !== 'employee',
  })

  const departments = deptData?.results || deptData || []
  const employees   = empData?.results  || empData  || []

  const mutation = useMutation({
    mutationFn: (payload) => taskService.create(payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Task created successfully!')
      const newId = res?.data?.id
      navigate(newId ? `/tasks/${newId}` : '/tasks')
    },
    onError: (err) => {
      const data = err.response?.data
      if (data && typeof data === 'object') {
        setErrors(data)
        toast.error('Please fix the errors below.')
      } else {
        toast.error('Failed to create task. Please try again.')
      }
    },
  })

  const set = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setErrors({})

    const local = {}
    if (!form.name.trim()) local.name = 'Task title is required.'

    if (Object.keys(local).length > 0) {
      setErrors(local)
      return
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      priority: form.priority,
      status: form.status,
      progress: Number(form.progress),
      ...(form.assigned_to && { assigned_to: Number(form.assigned_to) }),
      ...(form.department  && { department:  Number(form.department)  }),
      ...(form.start_date  && { start_date:  form.start_date }),
      ...(form.deadline    && { deadline:    form.deadline    }),
    }

    mutation.mutate(payload)
  }

  const fieldError = (name) =>
    errors[name] ? (
      <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
        <AlertCircle className="w-3 h-3 shrink-0" />
        {Array.isArray(errors[name]) ? errors[name][0] : errors[name]}
      </p>
    ) : null

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/tasks"
          className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-indigo-400" />
            Create Task
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">Assign a new task to an employee</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="card space-y-5">

          {/* Title */}
          <div>
            <label className="label">Title *</label>
            <input
              className={`input ${errors.name ? 'border-red-500' : ''}`}
              placeholder="e.g. Build login page"
              value={form.name}
              onChange={set('name')}
            />
            {fieldError('name')}
          </div>

          {/* Description */}
          <div>
            <label className="label">Description</label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="Describe the task in detail..."
              value={form.description}
              onChange={set('description')}
            />
            {fieldError('description')}
          </div>

          {/* Assign To + Department */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Assign To</label>
              <select className="input" value={form.assigned_to} onChange={set('assigned_to')}>
                <option value="">— Unassigned —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                ))}
              </select>
              {fieldError('assigned_to')}
            </div>
            <div>
              <label className="label">Department</label>
              <select className="input" value={form.department} onChange={set('department')}>
                <option value="">— None —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              {fieldError('department')}
            </div>
          </div>

          {/* Priority + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Priority</label>
              <select className="input" value={form.priority} onChange={set('priority')}>
                {Object.entries(PRIORITY_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={set('status')}>
                {Object.entries(STATUS_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Start Date + Deadline */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Start Date</label>
              <input
                className="input"
                type="date"
                value={form.start_date}
                onChange={set('start_date')}
              />
              {fieldError('start_date')}
            </div>
            <div>
              <label className="label">Deadline</label>
              <input
                className={`input ${errors.deadline ? 'border-red-500' : ''}`}
                type="date"
                value={form.deadline}
                onChange={set('deadline')}
              />
              {fieldError('deadline')}
            </div>
          </div>

          {/* Non-field errors */}
          {errors.non_field_errors && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                {Array.isArray(errors.non_field_errors)
                  ? errors.non_field_errors[0]
                  : errors.non_field_errors}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-4">
          <Link to="/tasks" className="btn-secondary flex-1 justify-center">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="btn-primary flex-1 justify-center"
          >
            {mutation.isPending ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <CheckSquare className="w-4 h-4" />
                Create Task
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
