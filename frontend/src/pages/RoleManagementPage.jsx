import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, ShieldOff, Search, UserCog } from 'lucide-react'
import { roleService } from '../services/api'
import LoadingSpinner from '../components/common/LoadingSpinner'
import toast from 'react-hot-toast'
import clsx from 'clsx'

export default function RoleManagementPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['role-management'],
    queryFn: () => roleService.list().then(r => r.data),
  })

  const assignMutation = useMutation({
    mutationFn: (id) => roleService.assignHR(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['role-management'] })
      toast.success(res.data.message)
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to assign HR role')
    },
  })

  const removeMutation = useMutation({
    mutationFn: (id) => roleService.removeHR(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['role-management'] })
      toast.success(res.data.message)
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to remove HR role')
    },
  })

  const employees = (data || []).filter(emp => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      emp.full_name.toLowerCase().includes(q) ||
      emp.email.toLowerCase().includes(q) ||
      (emp.department || '').toLowerCase().includes(q)
    )
  })

  const hrCount = (data || []).filter(e => e.role === 'hr').length

  if (isLoading) return <LoadingSpinner text="Loading employees..." />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <UserCog className="w-6 h-6 text-indigo-400" />
            Role Management
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Assign or remove the HR role for employees.
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <span className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-300">
            <span className="text-green-400 font-semibold">{hrCount}</span> HR
          </span>
          <span className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-300">
            <span className="text-slate-200 font-semibold">{(data || []).length - hrCount}</span> Employees
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          className="input pl-9 w-full"
          placeholder="Search by name, email or department…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Employee</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Email</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Department</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Employee ID</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Current Role</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500">
                    No employees found.
                  </td>
                </tr>
              ) : (
                employees.map(emp => {
                  const isHR = emp.role === 'hr'
                  const isBusy =
                    (assignMutation.isPending && assignMutation.variables === emp.id) ||
                    (removeMutation.isPending && removeMutation.variables === emp.id)

                  return (
                    <tr key={emp.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-white font-medium">{emp.full_name}</td>
                      <td className="px-4 py-3 text-slate-400">{emp.email}</td>
                      <td className="px-4 py-3 text-slate-400">{emp.department || '—'}</td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">{emp.employee_id}</td>
                      <td className="px-4 py-3">
                        <span className={clsx(
                          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium',
                          isHR
                            ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                            : 'bg-slate-700 text-slate-300 border border-slate-600'
                        )}>
                          {isHR ? (
                            <><ShieldCheck className="w-3 h-3" /> HR</>
                          ) : (
                            'Employee'
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isHR ? (
                          <button
                            className="btn btn-sm bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 flex items-center gap-1.5 disabled:opacity-50"
                            onClick={() => removeMutation.mutate(emp.id)}
                            disabled={isBusy}
                          >
                            <ShieldOff className="w-3.5 h-3.5" />
                            {isBusy ? 'Removing…' : 'Remove HR'}
                          </button>
                        ) : (
                          <button
                            className="btn btn-sm bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/25 flex items-center gap-1.5 disabled:opacity-50"
                            onClick={() => assignMutation.mutate(emp.id)}
                            disabled={isBusy}
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            {isBusy ? 'Assigning…' : 'Assign HR'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
