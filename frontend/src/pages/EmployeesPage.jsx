import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserPlus, Search, Filter, Trash2, Eye, Users } from 'lucide-react'
import { employeeService, departmentService } from '../services/api'
import { initials, statusLabel, timeAgo } from '../utils/helpers'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ProgressBar from '../components/common/ProgressBar'
import toast from 'react-hot-toast'
import clsx from 'clsx'

export default function EmployeesPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')


  const { data, isLoading } = useQuery({
    queryKey: ['employees', search, deptFilter, statusFilter],
    queryFn: () => employeeService.list({
      search: search || undefined,
      department: deptFilter || undefined,
      status: statusFilter || undefined,
    }).then(r => r.data),
  })

  const { data: deptData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentService.list().then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => employeeService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] })
      toast.success('Employee removed')
    },
  })

  const employees = data?.results || data || []
  const departments = deptData?.results || deptData || []

  const handleDelete = (e, id, name) => {
    e.stopPropagation()
    if (confirm(`Remove ${name}? This cannot be undone.`)) {
      deleteMutation.mutate(id)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-400" />
            Employees
          </h1>
          <p className="text-slate-400 text-sm mt-1">{employees.length} employees found</p>
        </div>
        <button
          onClick={() => navigate('/employees/add')}
          className="btn-primary"
        >
          <UserPlus className="w-4 h-4" />
          Add Employee
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, ID..."
              className="input pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input sm:w-48"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            <option value="">All Departments</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select
            className="input sm:w-40"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="on_leave">On Leave</option>
          </select>
        </div>
      </div>

      {/* Employee Grid */}
      {isLoading ? (
        <LoadingSpinner text="Loading employees..." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {employees.length === 0 ? (
            <div className="col-span-full text-center text-slate-500 py-16">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No employees found</p>
            </div>
          ) : (
            employees.map((emp) => (
              <div
                key={emp.id}
                className="card hover:border-indigo-500/40 cursor-pointer transition-all duration-200 hover:shadow-card-hover group"
                onClick={() => navigate(`/employees/${emp.id}`)}
              >
                {/* Avatar + online indicator */}
                <div className="flex items-start justify-between mb-3">
                  <div className="relative">
                    {emp.profile_photo ? (
                      <img
                        src={emp.profile_photo}
                        alt={emp.full_name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center text-sm font-semibold text-white">
                        {initials(emp.full_name)}
                      </div>
                    )}
                    <span className={clsx(
                      'absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-800',
                      emp.is_online ? 'bg-green-400' : 'bg-slate-500'
                    )} />
                  </div>

                  <button
                    onClick={(e) => handleDelete(e, emp.id, emp.full_name)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-lg transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Info */}
                <div className="mb-3">
                  <p className="font-semibold text-slate-200">{emp.full_name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{emp.role}</p>
                  <p className="text-xs text-slate-500">{emp.employee_id}</p>
                </div>

                {/* Department */}
                {emp.department_name && (
                  <span
                    className="badge text-[10px] mb-3"
                    style={{
                      backgroundColor: `${emp.department_color}15`,
                      color: emp.department_color,
                      border: `1px solid ${emp.department_color}30`,
                    }}
                  >
                    {emp.department_name}
                  </span>
                )}

                {/* Productivity */}
                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Productivity</span>
                    <span>{emp.productivity_score}%</span>
                  </div>
                  <ProgressBar value={emp.productivity_score} showLabel={false} size="sm" />
                </div>

                {/* Stats row */}
                <div className="flex gap-3 mt-3 pt-3 border-t border-slate-700">
                  <div className="text-center flex-1">
                    <p className="text-xs font-semibold text-slate-200">{emp.tasks_in_progress}</p>
                    <p className="text-[10px] text-slate-500">Active</p>
                  </div>
                  <div className="text-center flex-1">
                    <p className="text-xs font-semibold text-green-400">{emp.tasks_completed}</p>
                    <p className="text-[10px] text-slate-500">Done</p>
                  </div>
                  <div className="text-center flex-1">
                    <p className="text-xs font-semibold text-yellow-400">{emp.tasks_pending}</p>
                    <p className="text-[10px] text-slate-500">Pending</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

    </div>
  )
}
