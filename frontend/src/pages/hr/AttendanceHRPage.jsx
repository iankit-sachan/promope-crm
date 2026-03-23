import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CalendarDays, Download, AlertTriangle, Trophy,
  FileEdit, CheckCircle, XCircle, Clock, Flame,
} from 'lucide-react'
import api, { hrService, employeeService, departmentService } from '../../services/api'
import clsx from 'clsx'
import toast from 'react-hot-toast'

const TABS = ['Daily View', 'Calendar View', 'Export', 'Regularization', 'Anomalies', 'Leaderboard']

const STATUS_DOT = {
  present:  { bg: 'bg-green-500',  title: 'Present'  },
  late:     { bg: 'bg-yellow-400', title: 'Late'      },
  half_day: { bg: 'bg-orange-400', title: 'Half Day'  },
  absent:   { bg: 'bg-red-500',    title: 'Absent'    },
  overtime: { bg: 'bg-purple-500', title: 'Overtime'  },
}

const ANOMALY_LABELS = {
  frequent_late:     { label: 'Frequent Late',     cls: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' },
  frequent_absent:   { label: 'Frequent Absent',   cls: 'bg-red-500/10 text-red-400 border border-red-500/20'         },
  threshold_gaming:  { label: 'Threshold Gaming',  cls: 'bg-orange-500/10 text-orange-400 border border-orange-500/20' },
  missing_checkout:  { label: 'Missing Checkout',  cls: 'bg-slate-500/10 text-slate-400 border border-slate-500/20'   },
}

function StatusBadge({ status }) {
  const map = {
    present:  'badge bg-green-500/10 text-green-400',
    late:     'badge bg-yellow-500/10 text-yellow-400',
    half_day: 'badge bg-orange-500/10 text-orange-400',
    absent:   'badge bg-red-500/10 text-red-400',
    overtime: 'badge bg-purple-500/10 text-purple-400',
  }
  return <span className={map[status] || 'badge bg-slate-500/10 text-slate-400'}>{status.replace('_', ' ')}</span>
}

// ── Calendar grid ─────────────────────────────────────────────────────────────
function AttendanceCalendar({ records, year, month }) {
  const firstDay    = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  const startDow    = firstDay.getDay()

  const recordMap = {}
  ;(records || []).forEach(r => { recordMap[r.date] = r.status })

  const days = []
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
          const dateStr  = `${year}-${pad(month)}-${pad(day)}`
          const status   = recordMap[dateStr]
          const dot      = status ? STATUS_DOT[status] : null
          const dow      = new Date(year, month - 1, day).getDay()
          const isSunday = dow === 0
          return (
            <div
              key={day}
              className={clsx(
                'aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5',
                isSunday ? 'bg-slate-800/20 opacity-40' : 'bg-slate-800/60',
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

// ── Regularization Tab ────────────────────────────────────────────────────────
function RegularizationTab() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('pending')
  const [reviewNote, setReviewNote] = useState({})

  const { data: regs, isLoading } = useQuery({
    queryKey: ['admin-regularization', statusFilter],
    queryFn: () => api.get(`/attendance/regularization/admin/?status=${statusFilter}`).then(r => r.data),
  })

  const reviewMutation = useMutation({
    mutationFn: ({ id, action, note }) =>
      api.patch(`/attendance/regularization/${id}/review/`, { action, review_note: note }),
    onSuccess: () => {
      toast.success('Request reviewed!')
      qc.invalidateQueries({ queryKey: ['admin-regularization'] })
    },
    onError: () => toast.error('Review failed'),
  })

  const list = Array.isArray(regs) ? regs : []

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {['pending', 'approved', 'rejected'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-all',
              statusFilter === s ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            )}>
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="card text-center py-12 text-slate-500">Loading...</div>
      ) : list.length === 0 ? (
        <div className="card text-center py-12 text-slate-500">No {statusFilter} requests</div>
      ) : (
        <div className="space-y-3">
          {list.map(reg => (
            <div key={reg.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-white">{reg.employee_name}
                    <span className="text-xs text-slate-500 ml-2">#{reg.employee_code}</span>
                  </p>
                  <p className="text-sm text-slate-400 mt-0.5">
                    {reg.date} · <span className="text-slate-300">{reg.req_type?.replace(/_/g, ' ')}</span>
                  </p>
                  <p className="text-sm text-slate-400 mt-1 italic">"{reg.reason}"</p>
                  {(reg.requested_login_time || reg.requested_logout_time) && (
                    <p className="text-xs text-slate-500 mt-1">
                      Requested: {reg.requested_login_time || '—'} → {reg.requested_logout_time || '—'}
                    </p>
                  )}
                </div>
                <span className={clsx('text-xs px-2 py-1 rounded-full font-medium capitalize', {
                  'bg-yellow-500/10 text-yellow-400': reg.status === 'pending',
                  'bg-green-500/10 text-green-400':   reg.status === 'approved',
                  'bg-red-500/10 text-red-400':        reg.status === 'rejected',
                })}>
                  {reg.status}
                </span>
              </div>

              {reg.status === 'pending' && (
                <div className="flex gap-2 pt-2 border-t border-slate-700/50">
                  <input
                    type="text"
                    placeholder="Review note (optional)"
                    value={reviewNote[reg.id] || ''}
                    onChange={e => setReviewNote(p => ({ ...p, [reg.id]: e.target.value }))}
                    className="input text-sm flex-1"
                  />
                  <button
                    onClick={() => reviewMutation.mutate({ id: reg.id, action: 'approve', note: reviewNote[reg.id] || '' })}
                    disabled={reviewMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg"
                  >
                    <CheckCircle className="w-4 h-4" /> Approve
                  </button>
                  <button
                    onClick={() => reviewMutation.mutate({ id: reg.id, action: 'reject', note: reviewNote[reg.id] || '' })}
                    disabled={reviewMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg"
                  >
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                </div>
              )}

              {reg.status !== 'pending' && reg.review_note && (
                <p className="text-xs text-slate-500 pt-2 border-t border-slate-700/50">
                  Note by {reg.reviewed_by_name}: "{reg.review_note}"
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Anomaly Tab ───────────────────────────────────────────────────────────────
function AnomaliesTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['attendance-anomalies'],
    queryFn: () => api.get('/attendance/anomalies/').then(r => r.data),
  })

  const alerts = data?.alerts || []

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-yellow-400" />
        <h3 className="text-white font-semibold">Attendance Anomalies — Last 30 Days</h3>
        {alerts.length > 0 && (
          <span className="ml-2 bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full">{alerts.length} employee(s)</span>
        )}
      </div>

      {isLoading ? (
        <div className="card text-center py-12 text-slate-500">Analyzing patterns…</div>
      ) : alerts.length === 0 ? (
        <div className="card text-center py-12">
          <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-2" />
          <p className="text-slate-400">No anomalies detected — all patterns look normal!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map(alert => (
            <div key={alert.employee_id} className="card space-y-3">
              <div className="flex items-center gap-3">
                {alert.profile_photo ? (
                  <img src={alert.profile_photo} className="w-9 h-9 rounded-full object-cover" alt="" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-indigo-500/20 flex items-center justify-center text-sm text-indigo-400 font-bold">
                    {alert.employee_name?.[0]}
                  </div>
                )}
                <div>
                  <p className="font-medium text-white">{alert.employee_name}</p>
                  <p className="text-xs text-slate-500">{alert.employee_code} · {alert.department}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {alert.flags.map((flag, i) => {
                  const cfg = ANOMALY_LABELS[flag.type] || { label: flag.type, cls: 'bg-slate-700 text-slate-400' }
                  return (
                    <div key={i} className={clsx('text-xs px-3 py-1.5 rounded-lg', cfg.cls)}>
                      <span className="font-medium">{cfg.label}:</span> {flag.detail}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Leaderboard Tab ───────────────────────────────────────────────────────────
function LeaderboardTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['attendance-leaderboard'],
    queryFn: () => api.get('/attendance/leaderboard/').then(r => r.data),
  })

  const board = data?.leaderboard || []

  const medalColor = (i) => {
    if (i === 0) return 'text-yellow-400'
    if (i === 1) return 'text-slate-300'
    if (i === 2) return 'text-orange-400'
    return 'text-slate-500'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="w-5 h-5 text-yellow-400" />
        <h3 className="text-white font-semibold">Punctuality Leaderboard</h3>
      </div>

      {isLoading ? (
        <div className="card text-center py-12 text-slate-500">Loading…</div>
      ) : board.length === 0 ? (
        <div className="card text-center py-12 text-slate-500">No data yet</div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-[11px] uppercase tracking-wide">
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Employee</th>
                <th className="px-4 py-3 text-center">Score</th>
                <th className="px-4 py-3 text-center">Streak</th>
                <th className="px-4 py-3 text-center">Best Streak</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {board.map((emp, i) => (
                <tr key={emp.employee_id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className={clsx('text-lg font-bold', medalColor(i))}>
                      {i < 3 ? ['🥇','🥈','🥉'][i] : `#${i + 1}`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {emp.profile_photo ? (
                        <img src={emp.profile_photo} className="w-8 h-8 rounded-full object-cover" alt="" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs text-indigo-400 font-bold">
                          {emp.employee_name?.[0]}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-slate-200">{emp.employee_name}</p>
                        <p className="text-xs text-slate-500">{emp.department}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={clsx('text-sm font-bold', emp.punctuality_score >= 90 ? 'text-green-400' : emp.punctuality_score >= 75 ? 'text-yellow-400' : 'text-red-400')}>
                      {emp.punctuality_score}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="flex items-center justify-center gap-1 text-orange-400 font-bold">
                      <Flame className="w-3.5 h-3.5" /> {emp.current_streak}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-400 text-xs">{emp.longest_streak} days</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AttendanceHRPage() {
  const today  = new Date()
  const [activeTab, setActiveTab] = useState(0)

  const [dailyDate, setDailyDate] = useState(today.toISOString().slice(0, 10))
  const [dailyDept, setDailyDept] = useState('')
  const [calEmp,   setCalEmp]   = useState('')
  const [calYear,  setCalYear]  = useState(today.getFullYear())
  const [calMonth, setCalMonth] = useState(today.getMonth() + 1)
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

  const { data: dailyData, isLoading: dailyLoading } = useQuery({
    queryKey: ['hr-attendance-daily', dailyDate, dailyDept],
    queryFn:  () => hrService.attendance({ date: dailyDate, ...(dailyDept && { department: dailyDept }) }).then(r => r.data),
    enabled:  activeTab === 0,
  })

  const calStartDate = `${calYear}-${String(calMonth).padStart(2,'0')}-01`
  const lastDay      = new Date(calYear, calMonth, 0).getDate()
  const calEndDate   = `${calYear}-${String(calMonth).padStart(2,'0')}-${lastDay}`
  const { data: calData, isLoading: calLoading } = useQuery({
    queryKey: ['hr-attendance-cal', calEmp, calYear, calMonth],
    queryFn:  () => hrService.attendance({ employee: calEmp, start_date: calStartDate, end_date: calEndDate }).then(r => r.data),
    enabled:  activeTab === 1 && !!calEmp,
  })

  const calRecords   = calData?.results || calData || []
  const dailyRecords = dailyData?.results || dailyData || []
  const summary      = dailyRecords.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc }, {})

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await hrService.attendanceExport({ month: expMonth, year: expYear, ...(expDept && { department: expDept }) })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const a   = document.createElement('a')
      a.href    = url
      a.download = `attendance_${expYear}_${String(expMonth).padStart(2,'0')}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('CSV downloaded')
    } catch {
      toast.error('Export failed')
    } finally {
      setExporting(false)
    }
  }

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">HR Attendance</h1>
        <p className="text-slate-400 text-sm mt-1">Monitor, approve corrections, and export attendance records</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-slate-800/50 p-1 rounded-xl w-fit border border-slate-700">
        {TABS.map((tab, i) => (
          <button key={tab} onClick={() => setActiveTab(i)}
            className={clsx('px-3 py-2 rounded-lg text-sm font-medium transition-all',
              activeTab === i ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            )}>
            {tab}
          </button>
        ))}
      </div>

      {/* ── Daily View ── */}
      {activeTab === 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <input type="date" className="input text-sm" value={dailyDate} onChange={e => setDailyDate(e.target.value)} />
            <select className="input text-sm" value={dailyDept} onChange={e => setDailyDept(e.target.value)}>
              <option value="">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          {!dailyLoading && (
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Present',  key: 'present',  color: 'text-green-400',  bg: 'bg-green-500/10'  },
                { label: 'Late',     key: 'late',     color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
                { label: 'Half Day', key: 'half_day', color: 'text-orange-400', bg: 'bg-orange-500/10' },
                { label: 'Absent',   key: 'absent',   color: 'text-red-400',    bg: 'bg-red-500/10'    },
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
                      {['Employee','Dept','Login','Logout','Hours','OT','Status'].map(h => (
                        <th key={h} className="th text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {dailyRecords.map(r => (
                      <tr key={r.id} className="table-row">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-slate-200">{r.employee_name}</p>
                          <p className="text-xs text-slate-500">{r.employee_code}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-400">{r.department || '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{r.login_time_str || '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{r.logout_time_str || '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-400">{r.total_work_hours}h</td>
                        <td className="px-4 py-3 text-sm text-purple-400">
                          {r.overtime_hours > 0 ? `+${r.overtime_hours}h` : '—'}
                        </td>
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
            <select className="input text-sm" value={calEmp} onChange={e => setCalEmp(e.target.value)}>
              <option value="">Select Employee</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_id})</option>)}
            </select>
            <select className="input text-sm" value={calMonth} onChange={e => setCalMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select className="input text-sm" value={calYear} onChange={e => setCalYear(Number(e.target.value))}>
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
              <select className="input w-full text-sm" value={expMonth} onChange={e => setExpMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Year</label>
              <select className="input w-full text-sm" value={expYear} onChange={e => setExpYear(Number(e.target.value))}>
                {[today.getFullYear() - 1, today.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Department (optional)</label>
              <select className="input w-full text-sm" value={expDept} onChange={e => setExpDept(e.target.value)}>
                <option value="">All Departments</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <button onClick={handleExport} disabled={exporting} className="btn-primary flex items-center gap-2">
            <Download className="w-4 h-4" />
            {exporting ? 'Generating...' : 'Download CSV'}
          </button>
        </div>
      )}

      {/* ── Regularization ── */}
      {activeTab === 3 && <RegularizationTab />}

      {/* ── Anomalies ── */}
      {activeTab === 4 && <AnomaliesTab />}

      {/* ── Leaderboard ── */}
      {activeTab === 5 && <LeaderboardTab />}
    </div>
  )
}
