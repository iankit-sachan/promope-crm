/**
 * MyAttendancePage — Employee's personal attendance history.
 */
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Clock, LogIn, LogOut, CalendarDays, CheckCircle2,
  AlertCircle, Coffee, TrendingUp, ChevronLeft, ChevronRight,
  Timer, BarChart3, Flame, Zap, Star, FileEdit, X, Send,
} from 'lucide-react'
import api, { attendanceService } from '../services/api'
import { formatDate }        from '../utils/helpers'
import LoadingSpinner        from '../components/common/LoadingSpinner'
import clsx                  from 'clsx'
import toast                 from 'react-hot-toast'

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const STATUS_STYLE = {
  present:  { label: 'Present',  cls: 'bg-green-500/10 text-green-400'   },
  late:     { label: 'Late',     cls: 'bg-yellow-500/10 text-yellow-400' },
  half_day: { label: 'Half Day', cls: 'bg-orange-500/10 text-orange-400' },
  absent:   { label: 'Absent',   cls: 'bg-red-500/10 text-red-400'       },
  overtime: { label: 'Overtime', cls: 'bg-purple-500/10 text-purple-400' },
}

const REQ_TYPES = [
  { value: 'forgot_checkin',     label: 'Forgot to Check-in' },
  { value: 'forgot_checkout',    label: 'Forgot to Check-out' },
  { value: 'wrong_time',         label: 'Wrong Time Recorded' },
  { value: 'absent_but_present', label: 'Was Present (marked absent)' },
  { value: 'other',              label: 'Other' },
]

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    green:  'text-green-400 bg-green-500/10',
    yellow: 'text-yellow-400 bg-yellow-500/10',
    red:    'text-red-400 bg-red-500/10',
    indigo: 'text-indigo-400 bg-indigo-500/10',
    cyan:   'text-cyan-400 bg-cyan-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
  }
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xl font-bold text-white">{value}</p>
        <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
      </div>
    </div>
  )
}

function ScoreRing({ score, label, color }) {
  const clr = color === 'green' ? '#22c55e' : '#6366f1'
  const r = 28
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={r} fill="none" stroke="#1e293b" strokeWidth="5" />
          <circle cx="32" cy="32" r={r} fill="none" stroke={clr} strokeWidth="5"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">
          {score}%
        </span>
      </div>
      <p className="text-xs text-slate-400 text-center leading-tight">{label}</p>
    </div>
  )
}

// ── Regularization Modal ─────────────────────────────────────────────────────

function RegularizationModal({ date, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    date,
    req_type: 'forgot_checkin',
    reason: '',
    requested_login_time: '',
    requested_logout_time: '',
  })

  const mutation = useMutation({
    mutationFn: () => api.post('/attendance/regularization/', form),
    onSuccess: () => {
      toast.success('Regularization request submitted!')
      qc.invalidateQueries({ queryKey: ['my-regularizations'] })
      onClose()
    },
    onError: (err) => {
      const msg = err.response?.data?.detail || 'Submission failed'
      toast.error(msg)
    },
  })

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <FileEdit className="w-4 h-4 text-indigo-400" />
            Request Attendance Correction
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label className="label">Date</label>
          <input type="date" value={form.date} disabled className="input w-full opacity-60 cursor-not-allowed" />
        </div>

        <div>
          <label className="label">Request Type</label>
          <select value={form.req_type} onChange={e => setForm(p => ({ ...p, req_type: e.target.value }))}
            className="input w-full">
            {REQ_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Login Time</label>
            <input type="time" value={form.requested_login_time}
              onChange={e => setForm(p => ({ ...p, requested_login_time: e.target.value }))}
              className="input w-full" />
          </div>
          <div>
            <label className="label">Logout Time</label>
            <input type="time" value={form.requested_logout_time}
              onChange={e => setForm(p => ({ ...p, requested_logout_time: e.target.value }))}
              className="input w-full" />
          </div>
        </div>

        <div>
          <label className="label">Reason *</label>
          <textarea rows={3} value={form.reason}
            onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
            placeholder="Explain why correction is needed..."
            className="input w-full resize-none" />
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.reason || mutation.isPending}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            {mutation.isPending ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function MyAttendancePage() {
  const queryClient = useQueryClient()
  const today   = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [regModal, setRegModal] = useState(null) // date string or null

  // Today's attendance
  const { data: todayLog, isLoading: todayLoading } = useQuery({
    queryKey: ['attendance-today'],
    queryFn:  () => attendanceService.today().then(r => r.data),
    refetchInterval: 60_000,
  })

  // Score & streak
  const { data: scoreData } = useQuery({
    queryKey: ['attendance-my-score'],
    queryFn:  () => api.get('/attendance/my-score/').then(r => r.data),
  })

  // History for selected month
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['attendance-my', year, month],
    queryFn:  () => {
      const startDate = `${year}-${String(month).padStart(2,'0')}-01`
      const lastDay   = new Date(year, month, 0).getDate()
      const endDate   = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`
      return attendanceService.myHistory({ start_date: startDate, end_date: endDate }).then(r => r.data)
    },
  })

  const checkinMutation = useMutation({
    mutationFn: () => attendanceService.checkin(),
    onSuccess: () => {
      toast.success('Checked in successfully!')
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] })
      queryClient.invalidateQueries({ queryKey: ['attendance-my-score'] })
    },
    onError: () => toast.error('Check-in failed. Please try again.'),
  })

  const checkoutMutation = useMutation({
    mutationFn: () => attendanceService.checkout(),
    onSuccess: () => {
      toast.success('Checked out successfully!')
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] })
      queryClient.invalidateQueries({ queryKey: ['attendance-my-score'] })
    },
    onError: () => toast.error('Check-out failed. Please try again.'),
  })

  const stats = useMemo(() => {
    const records = historyData?.results ?? historyData ?? []
    const list    = Array.isArray(records) ? records : []
    return {
      present:   list.filter(r => r.status === 'present').length,
      late:      list.filter(r => r.status === 'late').length,
      halfDay:   list.filter(r => r.status === 'half_day').length,
      absent:    list.filter(r => r.status === 'absent').length,
      overtime:  list.filter(r => r.status === 'overtime').length,
      totalHours: list.reduce((acc, r) => acc + (parseFloat(r.total_work_hours) || 0), 0),
      overtimeHours: list.reduce((acc, r) => acc + (parseFloat(r.overtime_hours) || 0), 0),
      list,
    }
  }, [historyData])

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else              setMonth(m => m - 1)
  }
  function nextMonth() {
    const now = new Date()
    if (year === now.getFullYear() && month === now.getMonth() + 1) return
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else               setMonth(m => m + 1)
  }

  const isCurrentMonth  = year === today.getFullYear() && month === today.getMonth() + 1
  const checkedInToday  = todayLog?.login_time
  const checkedOutToday = todayLog?.logout_time
  const streak = scoreData?.streak
  const score  = scoreData?.month

  return (
    <div className="space-y-6">
      {regModal && <RegularizationModal date={regModal} onClose={() => setRegModal(null)} />}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <CalendarDays className="w-6 h-6 text-indigo-400" />
          My Attendance
        </h1>
        <p className="text-slate-400 text-sm mt-1">{formatDate(today.toISOString().slice(0, 10))}</p>
      </div>

      {/* Score + Streak Banner */}
      {scoreData && (
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-4 flex items-center gap-2">
            <Star className="w-4 h-4 text-yellow-400" />
            Your Score — {today.toLocaleString('default', { month: 'long' })}
          </h2>
          <div className="flex flex-wrap items-center gap-6">
            {/* Score rings */}
            <ScoreRing score={score?.attendance_score ?? 100}  label="Attendance" color="green" />
            <ScoreRing score={score?.punctuality_score ?? 100} label="Punctuality" color="indigo" />

            {/* Streak */}
            <div className="flex items-center gap-3 bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3">
              <Flame className="w-8 h-8 text-orange-400" />
              <div>
                <p className="text-2xl font-bold text-white">{streak?.current ?? 0}</p>
                <p className="text-xs text-slate-400">Day Streak</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-3">
              <Zap className="w-8 h-8 text-purple-400" />
              <div>
                <p className="text-2xl font-bold text-white">{streak?.longest ?? 0}</p>
                <p className="text-xs text-slate-400">Best Streak</p>
              </div>
            </div>

            {/* Month stats */}
            <div className="flex gap-4 text-center ml-auto">
              <div>
                <p className="text-lg font-bold text-green-400">{score?.present_days ?? 0}</p>
                <p className="text-[10px] text-slate-500 uppercase">Present</p>
              </div>
              <div>
                <p className="text-lg font-bold text-yellow-400">{score?.late_days ?? 0}</p>
                <p className="text-[10px] text-slate-500 uppercase">Late</p>
              </div>
              <div>
                <p className="text-lg font-bold text-red-400">{score?.absent_days ?? 0}</p>
                <p className="text-[10px] text-slate-500 uppercase">Absent</p>
              </div>
              {(score?.overtime_hours ?? 0) > 0 && (
                <div>
                  <p className="text-lg font-bold text-purple-400">{score.overtime_hours}h</p>
                  <p className="text-[10px] text-slate-500 uppercase">Overtime</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Today's Check-in Card */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-400" />
          Today
        </h2>
        {todayLoading ? (
          <LoadingSpinner text="Loading today's status…" />
        ) : (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex gap-6 flex-1">
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-0.5">Login</p>
                <p className="text-lg font-bold font-mono text-slate-200">{todayLog?.login_time_str || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-0.5">Logout</p>
                <p className="text-lg font-bold font-mono text-slate-400">{todayLog?.logout_time_str || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-0.5">Hours</p>
                <p className="text-lg font-bold text-slate-200">
                  {todayLog?.total_work_hours ? `${Number(todayLog.total_work_hours).toFixed(1)}h` : '—'}
                </p>
              </div>
              {todayLog?.overtime_hours > 0 && (
                <div>
                  <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-0.5">Overtime</p>
                  <p className="text-lg font-bold text-purple-400">+{Number(todayLog.overtime_hours).toFixed(1)}h</p>
                </div>
              )}
              {todayLog?.status && (
                <div>
                  <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-0.5">Status</p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[todayLog.status]?.cls || ''}`}>
                    {STATUS_STYLE[todayLog.status]?.label || todayLog.status}
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => checkinMutation.mutate()}
                disabled={checkedInToday || checkinMutation.isPending}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  checkedInToday ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-green-600 hover:bg-green-500 text-white'
                )}
              >
                <LogIn className="w-4 h-4" />
                {checkinMutation.isPending ? 'Checking in…' : checkedInToday ? 'Checked In' : 'Check In'}
              </button>
              <button
                onClick={() => checkoutMutation.mutate()}
                disabled={!checkedInToday || checkedOutToday || checkoutMutation.isPending}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  !checkedInToday || checkedOutToday ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-red-600 hover:bg-red-500 text-white'
                )}
              >
                <LogOut className="w-4 h-4" />
                {checkoutMutation.isPending ? 'Checking out…' : checkedOutToday ? 'Checked Out' : 'Check Out'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Month picker */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-slate-200 font-semibold w-36 text-center">{MONTHS[month - 1]} {year}</span>
          <button onClick={nextMonth} disabled={isCurrentMonth}
            className={clsx('p-1.5 rounded-lg transition-colors', isCurrentMonth ? 'text-slate-600 cursor-not-allowed' : 'text-slate-400 hover:text-white hover:bg-slate-700')}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Monthly stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={CheckCircle2} label="Present"      value={stats.present}                       color="green"  />
        <StatCard icon={AlertCircle}  label="Late"         value={stats.late}                          color="yellow" />
        <StatCard icon={Coffee}       label="Half Day"     value={stats.halfDay}                       color="cyan"   />
        <StatCard icon={TrendingUp}   label="Absent"       value={stats.absent}                        color="red"    />
        <StatCard icon={Timer}        label="Total Hours"  value={`${stats.totalHours.toFixed(1)}h`}   color="indigo" />
        <StatCard icon={Zap}          label="Overtime"     value={`${stats.overtimeHours.toFixed(1)}h`} color="purple" />
      </div>

      {/* History Table */}
      {historyLoading ? (
        <LoadingSpinner text="Loading attendance history…" />
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="px-4 py-3 border-b border-slate-700">
            <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-400" />
              Attendance History — {MONTHS[month - 1]} {year}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-[11px] uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Day</th>
                  <th className="px-4 py-3 text-center">Login</th>
                  <th className="px-4 py-3 text-center">Logout</th>
                  <th className="px-4 py-3 text-center">Hours</th>
                  <th className="px-4 py-3 text-center">OT</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {stats.list.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-slate-500">
                      No records for {MONTHS[month - 1]} {year}.
                    </td>
                  </tr>
                ) : (
                  stats.list.map(record => {
                    const cfg     = STATUS_STYLE[record.status] || STATUS_STYLE.absent
                    const dayName = new Date(record.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })
                    return (
                      <tr key={record.id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="px-4 py-3 text-slate-300 font-medium">{formatDate(record.date)}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{dayName}</td>
                        <td className="px-4 py-3 text-center text-slate-300 text-xs font-mono">{record.login_time_str || '—'}</td>
                        <td className="px-4 py-3 text-center text-slate-400 text-xs font-mono">{record.logout_time_str || '—'}</td>
                        <td className="px-4 py-3 text-center">
                          {record.total_work_hours > 0
                            ? <span className="text-slate-200 font-medium">{Number(record.total_work_hours).toFixed(1)}h</span>
                            : <span className="text-slate-600 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {record.overtime_hours > 0
                            ? <span className="text-purple-400 text-xs font-medium">+{Number(record.overtime_hours).toFixed(1)}h</span>
                            : <span className="text-slate-700 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>
                            {cfg.label}
                          </span>
                          {record.is_regularized && (
                            <span className="ml-1 text-[10px] text-indigo-400">(corrected)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {(record.status === 'absent' || !record.login_time || !record.logout_time) && !record.is_regularized && (
                            <button
                              onClick={() => setRegModal(record.date)}
                              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 mx-auto"
                            >
                              <FileEdit className="w-3 h-3" />
                              Correct
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
      )}
    </div>
  )
}
