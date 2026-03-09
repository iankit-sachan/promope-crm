import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { employeeService } from '../../services/api'
import { timeAgo, getStatusClass, statusLabel, initials } from '../../utils/helpers'
import LoadingSpinner from '../common/LoadingSpinner'
import { ExternalLink, Wifi, WifiOff } from 'lucide-react'
import clsx from 'clsx'

export default function EmployeeActivityTable({ compact = false }) {
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => employeeService.list({ page_size: 50 }).then(r => r.data),
    refetchInterval: 30000,
  })

  const employees = data?.results || data || []
  const display = compact ? employees.slice(0, 6) : employees

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm">Employee Activity</h3>
        {compact && (
          <button
            onClick={() => navigate('/employees')}
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            View all <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>

      {isLoading ? (
        <LoadingSpinner text="Loading employees..." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="th">Employee</th>
                <th className="th hidden md:table-cell">Department</th>
                <th className="th hidden lg:table-cell">Current Task</th>
                <th className="th">Status</th>
                <th className="th hidden lg:table-cell">Completed</th>
                <th className="th hidden xl:table-cell">Last Active</th>
              </tr>
            </thead>
            <tbody>
              {display.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-slate-500 py-8 text-sm">
                    No employees found
                  </td>
                </tr>
              ) : (
                display.map((emp) => (
                  <tr
                    key={emp.id}
                    className="table-row cursor-pointer"
                    onClick={() => navigate(`/employees/${emp.id}`)}
                  >
                    <td className="td">
                      <div className="flex items-center gap-2.5">
                        <div className="relative">
                          {emp.profile_photo ? (
                            <img
                              src={emp.profile_photo}
                              alt={emp.full_name}
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-xs font-semibold text-white">
                              {initials(emp.full_name)}
                            </div>
                          )}
                          <span className={clsx(
                            'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-800',
                            emp.is_online ? 'bg-green-400' : 'bg-slate-500'
                          )} />
                        </div>
                        <div>
                          <p className="font-medium text-slate-200 text-sm">{emp.full_name}</p>
                          <p className="text-xs text-slate-500">{emp.role}</p>
                        </div>
                      </div>
                    </td>
                    <td className="td hidden md:table-cell">
                      {emp.department_name ? (
                        <span
                          className="badge text-xs"
                          style={{
                            backgroundColor: `${emp.department_color}20`,
                            color: emp.department_color,
                            borderColor: `${emp.department_color}40`,
                            border: '1px solid',
                          }}
                        >
                          {emp.department_name}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="td hidden lg:table-cell">
                      <span className="text-slate-400 text-sm truncate max-w-[150px] block">
                        {emp.current_task?.name || '—'}
                      </span>
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-1.5">
                        {emp.is_online ? (
                          <Wifi className="w-3 h-3 text-green-400" />
                        ) : (
                          <WifiOff className="w-3 h-3 text-slate-500" />
                        )}
                        <span className={clsx(
                          'text-xs',
                          emp.is_online ? 'text-green-400' : 'text-slate-500'
                        )}>
                          {emp.is_online ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    </td>
                    <td className="td hidden lg:table-cell">
                      <span className="text-slate-300 text-sm">{emp.tasks_completed}</span>
                    </td>
                    <td className="td hidden xl:table-cell">
                      <span className="text-slate-500 text-xs">{emp.last_seen ? timeAgo(emp.last_seen) : '—'}</span>
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
