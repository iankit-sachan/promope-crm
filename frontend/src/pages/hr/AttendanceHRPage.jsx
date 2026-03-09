import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Download, Users, Clock } from 'lucide-react'
import { hrService, employeeService, departmentService } from '../../services/api'
import clsx from 'clsx'
import toast from 'react-hot-toast'

const TABS = ['Daily View', 'Calendar View', 'Export']

const STATUS_DOT = {
  present:  { bg: 'bg-green-500',  title: 'Present' },
  late:     { bg: 'bg-yellow-400', title: 'Late' },
  half_day: { bg: 'bg-orange-400', title: 'Half Day' },
  absent:   { bg: 'bg-red-500',    title: 'Absent' },
}

function StatusBadge({ status }) {
  const map = {
    present:  'badge bg-green-500/10 text-green-400',
    late:     'badge bg-yellow-500/10 text-yellow-400',
    half_day: 'badge bg-orange-500/10 text-orange-400',
    absent:   'badge bg-red-500/10 text-red-400',
  }
  return <span className={map[status] || 'badge bg-slate-500/10 text-slate-400'}>{status.replace('_', ' ')}</span>
}

// ── Calendar grid ─────────────────────────────────────────────────────────────
function AttendanceCalendar({ records, year, month }) {
  const firstDay = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  const startDow = firstDay.getDay() // 0=Sun

  const recordMap = {}
  ;(records || []).forEach(r => {
    recordMap[r.date] = r.status
  })

  const days = []
  // Empty cells before first day
  for (let i = 0; i < startDow; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)

  const pad = (n) => String(n).padStart(2, '0')

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1 text-center">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} className="text-xs text-slate-500 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />
          const dateStr = `${year}-${pad(month)}-${pad(day)}`
          const status  = recordMap[dateStr]
          const dot     = status ? STATUS_DOT[status] : null
          const isWeekend = new Date(year, month - 1, day).getDay() % 6 === 0
          return (
            <div
              key={day}
              className={clsx(
                'aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5',
                isWeekend ? 'bg-slate-800/30' : 'bg-slate-800/60',
              )}
              title={status ? `${dateStr}: ${status}` : dateStr}
            >
              <span className="text-xs text-slate-400">{day}</span>
              {dot ? (
                <span className={clsx('w-1.5 h-1.5 rounded-full', dot.bg)} />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-transparent" />
              )}
            </div>
          )
        })}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 flex-wrap">
        {Object.entries(STATUS_DOT).map(([s, { bg, title }]) => (
          <div key={s} className="flex items-center gap-1.5">
            <span className={clsx('w-2 h-2 rounded-full', bg)} />
            <span className="text-xs text-slate-400">{title}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-slate-600" />
          <span className="text-xs text-slate-400">No record</span>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AttendanceHRPage() {
  const today  = new Date()
  const [activeTab, setActiveTab] = useState(0)

  // Daily view state
  const [dailyDate, setDailyDate] = useState(today.toISOString().slice(0, 10))
  const [dailyDept, setDailyDept] = useState('')

  // Calendar view state
  const [calEmp,   setCalEmp]   = useState('')
  const [calYear,  setCalYear]  = useState(today.getFullYear())
  const [calMonth, setCalMonth] = useState(today.getMonth() + 1)

  // Export state
  const [expMonth, setExpMonth] = useState(today.getMonth() + 1)
  const [expYear,  setExpYear]  = useState(today.getFullYear())
  const [expDept,  setExpDept]  = useState('')
  const [exporting, setExporting] = useState(false)

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

  // Daily view data
  const { data: dailyData, isLoading: dailyLoading } = useQuery({
    queryKey: ['hr-attendance-daily', dailyDate, dailyDept],
    queryFn: () => hrService.attendance({
      date: dailyDate,
      ...(dailyDept && { department: dailyDept }),
    }).then(r => r.data),
    enabled: activeTab === 0,
  })

  // Calendar data
  const calStartDate = `${calYear}-${String(calMonth).padStart(2, '0')}-01`
  const lastDay = new Date(calYear, calMonth, 0).getDate()
  const calEndDate = `${calYear}-${String(calMonth).padStart(2, '0')}-${lastDay}`
  const { data: calData, isLoading: calLoading } = useQuery({
    queryKey: ['hr-attendance-cal', calEmp, calYear, calMonth],
    queryFn: () => hrService.attendance({
      employee: calEmp,
      start_date: calStartDate,
      end_date:   calEndDate,
    }).then(r => r.data),
    enabled: activeTab === 1 && !!calEmp,
  })
  const calRecords = calData?.results || calData || []

  const dailyRecords = dailyData?.results || dailyData || []

  // Summary counts
  const summary = dailyRecords.reduce(
    (acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc },
    {}
  )

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await hrService.attendanceExport({
        month: expMonth,
        year:  expYear,
        ...(expDept && { department: expDept }),
      })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const a   = document.createElement('a')
      a.href    = url
      a.download = `attendance_${expYear}_${String(expMonth).padStart(2, '0')}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('CSV downloaded')
    } catch {
      toast.error('Export failed')
    } finally {
      setExporting(false)
    }
  }

  const MONTHS = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">HR Attendance</h1>
        <p className="text-slate-400 text-sm mt-1">Monitor and export employee attendance records</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/50 p-1 rounded-xl w-fit border border-slate-700">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              activeTab === i ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Daily View ── */}
      {activeTab === 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <input
              type="date"
              className="input text-sm"
              value={dailyDate}
              onChange={e => setDailyDate(e.target.value)}
            />
            <select
              className="input text-sm"
              value={dailyDept}
              onChange={e => setDailyDept(e.target.value)}
            >
              <option value="">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          {/* Summary row */}
          {!dailyLoading && (
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Present',  key: 'present',  color: 'text-green-400',  bg: 'bg-green-500/10' },
                { label: 'Late',     key: 'late',      color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
                { label: 'Half Day', key: 'half_day',  color: 'text-orange-400', bg: 'bg-orange-500/10' },
                { label: 'Absent',   key: 'absent',    color: 'text-red-400',    bg: 'bg-red-500/10' },
              ].map(({ label, key, color, bg }) => (
                <div key={key} className={clsx('rounded-xl p-3 text-center', bg)}>
                  <p className={clsx('text-2xl font-bold', color)}>{summary[key] || 0}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          )}

          <div className="card overflow-hidden p-0">
            {dailyLoading ? (
              <div className="p-8 text-center text-slate-500">Loading...</div>
            ) : dailyRecords.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No attendance records for this date</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-slate-700">
                    <tr>
                      {['Employee','Dept','Login','Logout','Hours','Status'].map(h => (
                        <th key={h} className="th text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {dailyRecords.map(r => (
                      <tr key={r.id} className="table-row">
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-slate-200">{r.employee_name}</p>
                            <p className="text-xs text-slate-500">{r.employee_code}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-400">{r.department || '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{r.login_time_str || '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{r.logout_time_str || '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-400">{r.total_work_hours}h</td>
                        <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Calendar View ── */}
      {activeTab === 1 && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <select
              className="input text-sm"
              value={calEmp}
              onChange={e => setCalEmp(e.target.value)}
            >
              <option value="">Select Employee</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.full_name} ({e.employee_id})</option>
              ))}
            </select>
            <select
              className="input text-sm"
              value={calMonth}
              onChange={e => setCalMonth(Number(e.target.value))}
            >
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select
              className="input text-sm"
              value={calYear}
              onChange={e => setCalYear(Number(e.target.value))}
            >
              {[today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {!calEmp ? (
            <div className="card text-center py-12 text-slate-500">Select an employee to view calendar</div>
          ) : calLoading ? (
            <div className="card text-center py-12 text-slate-500">Loading...</div>
          ) : (
            <div className="card">
              <h3 className="font-medium text-slate-200 mb-4">
                {MONTHS[calMonth - 1]} {calYear} — {calRecords[0]?.employee_name || ''}
              </h3>
              <AttendanceCalendar records={calRecords} year={calYear} month={calMonth} />
            </div>
          )}
        </div>
      )}

      {/* ── Export ── */}
      {activeTab === 2 && (
        <div className="card max-w-md space-y-5">
          <div>
            <h3 className="font-semibold text-slate-200">Export Attendance CSV</h3>
            <p className="text-slate-400 text-sm mt-1">Download a CSV report for a specific month</p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Month</label>
              <select
                className="input w-full text-sm"
                value={expMonth}
                onChange={e => setExpMonth(Number(e.target.value))}
              >
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Year</label>
              <select
                className="input w-full text-sm"
                value={expYear}
                onChange={e => setExpYear(Number(e.target.value))}
              >
                {[today.getFullYear() - 1, today.getFullYear()].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Department (optional)</label>
              <select
                className="input w-full text-sm"
                value={expDept}
                onChange={e => setExpDept(e.target.value)}
              >
                <option value="">All Departments</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="btn-primary flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Generating...' : 'Download CSV'}
          </button>
        </div>
      )}
    </div>
  )
}
