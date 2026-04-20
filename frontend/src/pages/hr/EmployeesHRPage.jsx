import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Edit, UserX, UserCheck, X, ChevronDown, UserPlus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { employeeService, departmentService } from '../../services/api'
import { formatDate, initials } from '../../utils/helpers'
import clsx from 'clsx'
import toast from 'react-hot-toast'

function StatusBadge({ status }) {
  const map = {
    active:   'badge bg-green-500/10 text-green-400 border border-green-500/20',
    inactive: 'badge bg-slate-500/10 text-slate-400 border border-slate-500/20',
    on_leave: 'badge bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  }
  return (
    <span className={map[status] || 'badge bg-slate-500/10 text-slate-400'}>
      {status.replace('_', ' ')}
    </span>
  )
}

// ── Edit modal ────────────────────────────────────────────────────────────────
function EditEmployeeModal({ employee, departments, onClose, onSave }) {
  const [form, setForm] = useState({
    full_name:    employee.full_name    || '',
    email:        employee.email        || '',
    phone:        employee.phone        || '',
    role:         employee.role         || '',
    status:       employee.status       || 'active',
    joining_date: employee.joining_date || '',
    salary:       employee.salary       || '',
    address:      employee.address      || '',
    department:   employee.department   || '',
  })

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto fade-in">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h3 className="font-semibold text-slate-200">Edit Employee</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          {[
            { name: 'full_name',    label: 'Full Name',    type: 'text' },
            { name: 'email',        label: 'Email',        type: 'email' },
            { name: 'phone',        label: 'Phone',        type: 'text' },
            { name: 'role',         label: 'Job Title',    type: 'text' },
            { name: 'joining_date', label: 'Joining Date', type: 'date' },
            { name: 'salary',       label: 'Salary',       type: 'number' },
          ].map(({ name, label, type }) => (
            <div key={name}>
              <label className="text-xs text-slate-400 mb-1 block">{label}</label>
              <input
                type={type}
                name={name}
                className="input w-full"
                value={form[name]}
                onChange={handleChange}
              />
            </div>
          ))}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Department</label>
            <select
              name="department"
              className="input w-full"
              value={form.department || ''}
              onChange={handleChange}
            >
              <option value="">No Department</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Status</label>
            <select
              name="status"
              className="input w-full"
              value={form.status}
              onChange={handleChange}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="on_leave">On Leave</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-slate-400 mb-1 block">Address</label>
            <textarea
              name="address"
              className="input w-full resize-none"
              rows={2}
              value={form.address}
              onChange={handleChange}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-slate-700">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={() => onSave(form)} className="btn-primary">Save Changes</button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function EmployeesHRPage() {
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [editTarget, setEditTarget] = useState(null)
  const qc = useQueryClient()

  const { data: empData, isLoading } = useQuery({
    queryKey: ['hr-employees', search, deptFilter, statusFilter],
    queryFn: () => employeeService.list({
      search: search || undefined,
      department: deptFilter || undefined,
      status: statusFilter || undefined,
      page_size: 100,
    }).then(r => r.data),
  })

  const { data: deptData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentService.list().then(r => r.data),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => employeeService.update(id, data),
    onSuccess: () => {
      toast.success('Employee updated')
      setEditTarget(null)
      qc.invalidateQueries({ queryKey: ['hr-employees'] })
    },
    onError: () => toast.error('Update failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => employeeService.delete(id),
    onSuccess: () => {
      toast.success('Employee removed')
      qc.invalidateQueries({ queryKey: ['hr-employees'] })
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Delete failed'),
  })

  const handleDelete = (emp) => {
    if (window.confirm(`Are you sure you want to remove ${emp.full_name}? Their account will be deactivated.`)) {
      deleteMutation.mutate(emp.id)
    }
  }

  const employees  = empData?.results || empData || []
  const departments = deptData?.results || deptData || []

  const toggleStatus = (emp) => {
    const newStatus = emp.status === 'active' ? 'inactive' : 'active'
    updateMutation.mutate({ id: emp.id, data: { status: newStatus } })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">HR — Employees</h1>
          <p className="text-slate-400 text-sm mt-1">Manage employee records and assignments</p>
        </div>
        <Link to="/employees/add" className="btn-primary flex items-center gap-2">
          <UserPlus className="w-4 h-4" />
          Add Employee
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search employees..."
            className="input pl-9 w-full"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input text-sm"
          value={deptFilter}
          onChange={e => setDeptFilter(e.target.value)}
        >
          <option value="">All Departments</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select
          className="input text-sm"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="on_leave">On Leave</option>
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : employees.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No employees found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-700">
                <tr>
                  {['Employee','Dept','Job Title','Status','Joining Date','Salary','Score','Actions'].map(h => (
                    <th key={h} className="th text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {employees.map(emp => (
                  <tr key={emp.id} className="table-row">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {emp.profile_photo ? (
                          <img src={emp.profile_photo} className="w-8 h-8 rounded-full object-cover" alt="" />
                        ) : (
                          <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-xs font-semibold text-white">
                            {initials(emp.full_name)}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-slate-200">{emp.full_name}</p>
                          <p className="text-xs text-slate-500">{emp.employee_id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {emp.department_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">{emp.role || '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={emp.status} /></td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {emp.joining_date ? formatDate(emp.joining_date) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {emp.salary ? `₹${Number(emp.salary).toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${emp.productivity_score || 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400">{emp.productivity_score ?? 0}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditTarget(emp)}
                          className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-700 rounded-lg"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleStatus(emp)}
                          disabled={updateMutation.isPending}
                          className={clsx(
                            'p-1.5 rounded-lg',
                            emp.status === 'active'
                              ? 'text-slate-400 hover:text-red-400 hover:bg-slate-700'
                              : 'text-slate-400 hover:text-green-400 hover:bg-slate-700'
                          )}
                          title={emp.status === 'active' ? 'Deactivate' : 'Activate'}
                        >
                          {emp.status === 'active'
                            ? <UserX className="w-4 h-4" />
                            : <UserCheck className="w-4 h-4" />
                          }
                        </button>
                        <button
                          onClick={() => handleDelete(emp)}
                          disabled={deleteMutation.isPending}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg"
                          title="Delete employee"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-500 text-right">{employees.length} employees shown</p>

      {editTarget && (
        <EditEmployeeModal
          employee={editTarget}
          departments={departments}
          onClose={() => setEditTarget(null)}
          onSave={(data) => updateMutation.mutate({ id: editTarget.id, data })}
        />
      )}
    </div>
  )
}
