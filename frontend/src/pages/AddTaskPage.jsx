import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckSquare, ArrowLeft, AlertCircle, X, ChevronDown, Check } from 'lucide-react'
import { taskService, departmentService, employeeService } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { initials } from '../utils/helpers'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const INITIAL_FORM = {
  name: '',
  description: '',
  assigned_to_ids: [],
  department: '',
  priority: 'medium',
  status: 'pending',
  start_date: '',
  deadline: '',
  progress: 0,
}

const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' }
const STATUS_LABELS   = { pending: 'Pending', in_progress: 'In Progress', completed: 'Completed', delayed: 'Delayed' }

// ── Multi-Select Dropdown ────────────────────────────────────────────────────
function MultiEmployeeSelect({ employees, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = employees.filter(e =>
    e.full_name.toLowerCase().includes(search.toLowerCase())
  )

  const toggle = (id) => {
    onChange(selected.includes(id)
      ? selected.filter(x => x !== id)
      : [...selected, id]
    )
  }

  const selectedEmps = employees.filter(e => selected.includes(e.id))

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="input w-full text-left flex items-center justify-between min-h-[42px]"
      >
        {selected.length === 0 ? (
          <span className="text-slate-500">— Select employees —</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {selectedEmps.map(emp => (
              <span key={emp.id} className="inline-flex items-center gap-1 bg-indigo-500/20 text-indigo-300 text-xs px-2 py-0.5 rounded-full">
                {emp.full_name}
                <button type="button" onClick={(e) => { e.stopPropagation(); toggle(emp.id) }}
                  className="hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <ChevronDown className={clsx('w-4 h-4 text-slate-400 flex-shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-60 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-slate-700">
            <input
              type="text"
              placeholder="Search employees..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input w-full text-sm py-1.5"
              autoFocus
            />
          </div>

          {/* Select All / Clear */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700">
            <button type="button" onClick={() => onChange(employees.map(e => e.id))}
              className="text-xs text-indigo-400 hover:text-indigo-300">Select All</button>
            <button type="button" onClick={() => onChange([])}
              className="text-xs text-slate-400 hover:text-slate-300">Clear</button>
          </div>

          {/* Options */}
          <div className="overflow-y-auto max-h-40">
            {filtered.length === 0 ? (
              <p className="text-center text-slate-500 text-sm py-4">No employees found</p>
            ) : (
              filtered.map(emp => {
                const isSelected = selected.includes(emp.id)
                return (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => toggle(emp.id)}
                    className={clsx(
                      'w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-700/50 transition-colors',
                      isSelected && 'bg-indigo-500/10'
                    )}
                  >
                    <div className={clsx(
                      'w-5 h-5 rounded border flex items-center justify-center flex-shrink-0',
                      isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-500'
                    )}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="w-7 h-7 bg-indigo-600/30 rounded-full flex items-center justify-center text-[10px] text-indigo-300 font-medium flex-shrink-0">
                      {initials(emp.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 truncate">{emp.full_name}</p>
                      <p className="text-[10px] text-slate-500">{emp.employee_id}</p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
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

  // Single task create (for 0 or 1 employee)
  const singleMutation = useMutation({
    mutationFn: (payload) => taskService.create(payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Task created successfully!')
      navigate(res?.data?.id ? `/tasks/${res.data.id}` : '/tasks')
    },
    onError: (err) => {
      const data = err.response?.data
      if (data && typeof data === 'object') { setErrors(data); toast.error('Please fix the errors below.') }
      else toast.error('Failed to create task.')
    },
  })

  // Bulk task create (for multiple employees)
  const bulkMutation = useMutation({
    mutationFn: (payload) => taskService.bulkCreate(payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      toast.success(`${res.data.count} task(s) created successfully!`)
      navigate('/tasks')
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || 'Failed to create tasks.')
    },
  })

  const set = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setErrors({})

    if (!form.name.trim()) {
      setErrors({ name: 'Task title is required.' })
      return
    }

    const ids = form.assigned_to_ids

    if (ids.length <= 1) {
      // Single task — use existing endpoint
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        priority: form.priority,
        status: form.status,
        progress: Number(form.progress),
        ...(ids.length === 1 && { assigned_to: ids[0] }),
        ...(form.department && { department: Number(form.department) }),
        ...(form.start_date && { start_date: form.start_date }),
        ...(form.deadline   && { deadline: form.deadline }),
      }
      singleMutation.mutate(payload)
    } else {
      // Multiple employees — use bulk endpoint
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        assigned_to_ids: ids,
        priority: form.priority,
        status: form.status,
        progress: Number(form.progress),
        ...(form.department && { department: Number(form.department) }),
        ...(form.start_date && { start_date: form.start_date }),
        ...(form.deadline   && { deadline: form.deadline }),
      }
      bulkMutation.mutate(payload)
    }
  }

  const isPending = singleMutation.isPending || bulkMutation.isPending

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
        <Link to="/tasks" className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors">
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

          {/* Assign To (Multi-Select) + Department */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">
                Assign To
                {form.assigned_to_ids.length > 1 && (
                  <span className="ml-2 text-xs text-indigo-400 font-normal">
                    ({form.assigned_to_ids.length} selected — {form.assigned_to_ids.length} tasks will be created)
                  </span>
                )}
              </label>
              <MultiEmployeeSelect
                employees={employees}
                selected={form.assigned_to_ids}
                onChange={(ids) => setForm(prev => ({ ...prev, assigned_to_ids: ids }))}
              />
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
              <input className="input" type="date" value={form.start_date} onChange={set('start_date')} />
              {fieldError('start_date')}
            </div>
            <div>
              <label className="label">Deadline</label>
              <input className={`input ${errors.deadline ? 'border-red-500' : ''}`} type="date" value={form.deadline} onChange={set('deadline')} />
              {fieldError('deadline')}
            </div>
          </div>

          {/* Non-field errors */}
          {errors.non_field_errors && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{Array.isArray(errors.non_field_errors) ? errors.non_field_errors[0] : errors.non_field_errors}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-4">
          <Link to="/tasks" className="btn-secondary flex-1 justify-center">Cancel</Link>
          <button type="submit" disabled={isPending} className="btn-primary flex-1 justify-center">
            {isPending ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <CheckSquare className="w-4 h-4" />
                {form.assigned_to_ids.length > 1
                  ? `Create ${form.assigned_to_ids.length} Tasks`
                  : 'Create Task'
                }
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
