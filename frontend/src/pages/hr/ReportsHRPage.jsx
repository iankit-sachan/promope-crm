import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { Download, TrendingUp, Clock, CalendarOff } from 'lucide-react'
import { hrService, employeeService, departmentService } from '../../services/api'
import clsx from 'clsx'

const PERIODS = ['weekly', 'monthly', 'custom']

export default function ReportsHRPage() {
  const [period,    setPeriod]    = useState('monthly')
  const [startDate, setStartDate] = useState('')
  const [endDate,   setEndDate]   = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [empFilter,  setEmpFilter]  = useState('')

  const queryEnabled = period !== 'custom' || (!!startDate && !!endDate)

  const { data, isLoading } = useQuery({
    queryKey: ['hr-reports', period, startDate, endDate, deptFilter, empFilter],
    queryFn: () => hrService.reports({
      period,
      ...(period === 'custom' && { start_date: startDate, end_date: endDate }),
      ...(deptFilter && { department: deptFilter }),
      ...(empFilter  && { employee: empFilter }),
    }).then(r => r.data),
    enabled: queryEnabled,
  })

  const { data: deptData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentService.list().then(r => r.data),
  })
  const { data: empData } = useQuery({
    queryKey: ['employees-minimal'],
    queryFn: () => employeeService.list({ page_size: 200 }).then(r => r.data),
  })
  const departments = deptData?.results || deptData || []
  const employees   = empData?.results  || empData  || []

  const results = data?.results || []

  // Dept-level aggregates for chart
  const deptMap = {}
  results.forEach(r => {
    const d = r.department || 'Unknown'
    if (!deptMap[d]) deptMap[d] = { dept: d, attendance: [], tasks: [] }
    deptMap[d].attendance.push(r.attendance_rate)
    deptMap[d].tasks.push(r.task_completion_rate)
  })
  const deptChartData = Object.values(deptMap).map(d => ({
    dept: d.dept,
    attendance: d.attendance.length
      ? Math.round(d.attendance.reduce((a, b) => a + b, 0) / d.attendance.length)
      : 0,
    tasks: d.tasks.length
      ? Math.round(d.tasks.reduce((a, b) => a + b, 0) / d.tasks.length)
      : 0,
  }))

  const handleExport = () => {
    if (results.length === 0) return
    const headers = [
      'Employee','Employee ID','Department',
      'Total Tasks','Completed Tasks','Task Completion %',
      'Hours Logged','Attendance Rate %','Days Present','Leave Days',
    ]
    const rows = results.map(r => [
      r.employee_name, r.employee_code, r.department || '',
      r.total_tasks, r.completed_tasks, r.task_completion_rate,
      r.hours_logged, r.attendance_rate, r.attendance_days_present, r.leave_days_taken,
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a   = document.createElement('a')
    a.href    = url
    a.download = `hr_reports_${period}_${data?.start_date || ''}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6 printable">
      <div className="flex items-start justify-between no-print">
        <div>
          <h1 className="text-2xl font-bold text-white">HR Reports</h1>
          <p className="text-slate-400 text-sm mt-1">Employee performance summary by period</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="btn-ghost flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button onClick={() => window.print()} className="btn-ghost flex items-center gap-2 text-sm">
            🖨️ Print
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 no-print">
        <div className="flex gap-1 bg-slate-800/50 p-1 rounded-xl border border-slate-700">
          {PERIODS.map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-all',
                period === p ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              )}
            >
              {p}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <>
            <input type="date" className="input text-sm" value={startDate}
              onChange={e => setStartDate(e.target.value)} placeholder="Start date" />
            <input type="date" className="input text-sm" value={endDate}
              onChange={e => setEndDate(e.target.value)} placeholder="End date" />
          </>
        )}
        <select className="input text-sm" value={deptFilter}
          onChange={e => setDeptFilter(e.target.value)}>
          <option value="">All Departments</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="input text-sm" value={empFilter}
          onChange={e => setEmpFilter(e.target.value)}>
          <option value="">All Employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
        </select>
      </div>

      {data && (
        <p className="text-xs text-slate-500">
          Period: {data.start_date} → {data.end_date}
        </p>
      )}

      {/* Department chart */}
      {deptChartData.length > 0 && (
        <div className="card">
          <h2 className="text-base font-semibold mb-4">Department Averages</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={deptChartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="dept" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickFormatter={v => `${v}%`} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                formatter={v => `${v}%`}
              />
              <Legend
                formatter={v => <span style={{ color: '#94a3b8', fontSize: 12 }}>{v}</span>}
              />
              <Bar dataKey="attendance" name="Attendance %" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="tasks" name="Task Completion %" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Results table */}
      <div className="card overflow-hidden p-0">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Loading report...</div>
        ) : !queryEnabled ? (
          <div className="p-8 text-center text-slate-500">
            Select a start and end date for custom period
          </div>
        ) : results.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No data for this period</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-700">
                <tr>
                  {[
                    'Employee','Department',
                    'Attendance','Tasks Done','Completion %',
                    'Hours Logged','Leave Days',
                  ].map(h => (
                    <th key={h} className="th text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {results.map(r => (
                  <tr key={r.employee_id} className="table-row">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-200">{r.employee_name}</p>
                      <p className="text-xs text-slate-500">{r.employee_code}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">{r.department || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-14 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${r.attendance_rate}%` }} />
                        </div>
                        <span className="text-xs text-slate-300">{r.attendance_rate}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-center">
                      {r.completed_tasks}/{r.total_tasks}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-14 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full"
                            style={{ width: `${r.task_completion_rate}%` }} />
                        </div>
                        <span className="text-xs text-slate-300">{r.task_completion_rate}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">{r.hours_logged}h</td>
                    <td className="px-4 py-3 text-sm text-slate-400 text-center">{r.leave_days_taken}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
