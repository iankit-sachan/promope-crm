import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus, ArrowLeft, AlertCircle } from 'lucide-react'
import { employeeService, departmentService } from '../services/api'
import toast from 'react-hot-toast'

const INITIAL_FORM = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  department_id: '',
  role: '',
  joining_date: new Date().toISOString().slice(0, 10),
  salary: '',
  password: '',
}

export default function AddEmployeePage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [form, setForm] = useState(INITIAL_FORM)
  const [errors, setErrors] = useState({})

  const { data: deptData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentService.list().then(r => r.data),
  })
  const departments = deptData?.results || deptData || []

  const mutation = useMutation({
    mutationFn: (payload) => employeeService.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] })
      toast.success('Employee added successfully!')
      navigate('/employees')
    },
    onError: (err) => {
      const data = err.response?.data
      if (data && typeof data === 'object') {
        setErrors(data)
        toast.error('Please fix the errors below.')
      } else {
        toast.error('Failed to add employee. Please try again.')
      }
    },
  })

  const set = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
    setErrors((prev) => ({ ...prev, [field]: undefined, full_name: undefined }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setErrors({})

    const local = {}
    if (!form.first_name.trim()) local.first_name = 'First name is required.'
    if (!form.last_name.trim()) local.last_name = 'Last name is required.'
    if (!form.email.trim()) local.email = 'Email is required.'
    if (!form.role.trim()) local.role = 'Job title is required.'
    if (!form.joining_date) local.joining_date = 'Joining date is required.'
    if (!form.password || form.password.length < 8) local.password = 'Password must be at least 8 characters.'

    if (Object.keys(local).length > 0) {
      setErrors(local)
      return
    }

    const payload = {
      full_name: `${form.first_name.trim()} ${form.last_name.trim()}`,
      email: form.email.trim(),
      phone: form.phone.trim(),
      role: form.role.trim(),
      joining_date: form.joining_date,
      password: form.password,
      ...(form.department_id && { department_id: Number(form.department_id) }),
      ...(form.salary && { salary: form.salary }),
    }

    mutation.mutate(payload)
  }

  const fieldError = (name) =>
    errors[name] ? (
      <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
        <AlertCircle className="w-3 h-3" />
        {Array.isArray(errors[name]) ? errors[name][0] : errors[name]}
      </p>
    ) : null

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/employees"
          className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <UserPlus className="w-6 h-6 text-indigo-400" />
            Add Employee
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">Create a new employee account</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} noValidate>
        <div className="card space-y-5">
          {/* Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">First Name *</label>
              <input
                className={`input ${errors.first_name ? 'border-red-500' : ''}`}
                placeholder="John"
                value={form.first_name}
                onChange={set('first_name')}
              />
              {fieldError('first_name')}
            </div>
            <div>
              <label className="label">Last Name *</label>
              <input
                className={`input ${errors.last_name ? 'border-red-500' : ''}`}
                placeholder="Doe"
                value={form.last_name}
                onChange={set('last_name')}
              />
              {fieldError('last_name')}
              {fieldError('full_name')}
            </div>
          </div>

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Email Address *</label>
              <input
                className={`input ${errors.email ? 'border-red-500' : ''}`}
                type="email"
                placeholder="john@company.com"
                value={form.email}
                onChange={set('email')}
              />
              {fieldError('email')}
            </div>
            <div>
              <label className="label">Phone</label>
              <input
                className="input"
                placeholder="+91 98765 43210"
                value={form.phone}
                onChange={set('phone')}
              />
              {fieldError('phone')}
            </div>
          </div>

          {/* Department + Role */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Department</label>
              <select
                className="input"
                value={form.department_id}
                onChange={set('department_id')}
              >
                <option value="">— None —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              {fieldError('department_id')}
            </div>
            <div>
              <label className="label">Job Title *</label>
              <input
                className={`input ${errors.role ? 'border-red-500' : ''}`}
                placeholder="e.g. Senior Developer"
                value={form.role}
                onChange={set('role')}
              />
              {fieldError('role')}
            </div>
          </div>

          {/* Joining Date + Salary */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Joining Date *</label>
              <input
                className={`input ${errors.joining_date ? 'border-red-500' : ''}`}
                type="date"
                value={form.joining_date}
                onChange={set('joining_date')}
              />
              {fieldError('joining_date')}
            </div>
            <div>
              <label className="label">Salary</label>
              <input
                className="input"
                type="number"
                placeholder="e.g. 75000"
                min="0"
                value={form.salary}
                onChange={set('salary')}
              />
              {fieldError('salary')}
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="label">Temporary Password *</label>
            <input
              className={`input ${errors.password ? 'border-red-500' : ''}`}
              type="password"
              placeholder="Min. 8 characters"
              value={form.password}
              onChange={set('password')}
            />
            <p className="text-slate-500 text-xs mt-1">
              The employee will use this password to log in for the first time.
            </p>
            {fieldError('password')}
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
          <Link to="/employees" className="btn-secondary flex-1 justify-center">
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
                Adding...
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                Add Employee
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
