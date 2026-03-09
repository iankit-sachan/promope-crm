/**
 * MyAttendancePage — Employee's personal attendance history.
 *
 * Shows today's check-in card, a month picker, monthly stats,
 * and a paginated table of the employee's past attendance logs.
 */
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Clock, LogIn, LogOut, CalendarDays, CheckCircle2,
  AlertCircle, Coffee, TrendingUp, ChevronLeft, ChevronRight,
  Timer, BarChart3,
} from 'lucide-react'
import { attendanceService } from '../services/api'
import { formatDate }        from '../utils/helpers'
import LoadingSpinner        from '../components/common/LoadingSpinner'
import clsx                  from 'clsx'
import toast                 from 'react-hot-toast'

// ── helpers ───────────────────────────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const STATUS_STYLE = {
  present:  { label: 'Present',  cls: 'bg-green-500/10 text-green-400'  },
  late:     { label: 'Late',     cls: 'bg-yellow-500/10 text-yellow-400' },
  half_day: { label: 'Half Day', cls: 'bg-orange-500/10 text-orange-400' },
  absent:   { label: 'Absent',   cls: 'bg-red-500/10 text-red-400'       },
}

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    green:  'text-green-400 bg-green-500/10',
    yellow: 'text-yellow-400 bg-yellow-500/10',
    red:    'text-red-400 bg-red-500/10',
    indigo: 'text-indigo-400 bg-indigo-500/10',
    cyan:   'text-cyan-400 bg-cyan-500/10',
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

// ── main ──────────────────────────────────────────────────────────────────────

export default function MyAttendancePage() {
  const queryClient = useQueryClient()

  const today   = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)   // 1-based

  // ── Today's attendance ──
  const { data: todayLog, isLoading: todayLoading } = useQuery({
    queryKey: ['attendance-today'],
    queryFn:  () => attendanceService.today().then(r => r.data),
    refetchInterval: 60_000,
  })

  // ── My history for selected month ──
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['attendance-my', year, month],
    queryFn:  () => {
      const startDate = `${year}-${String(month).padStart(2,'0')}-01`
      const lastDay   = new Date(year, month, 0).getDate()
      const endDate   = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`
      return attendanceService.myHistory({ start_date: startDate, end_date: endDate })
        .then(r => r.data)
    },
  })

  // Check-in mutation
  const checkinMutation = useMutation({
    mutationFn: () => attendanceService.checkin(),
    onSuccess: () => {
      toast.success('Checked in successfully!')
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] })
    },
    onError: () => toast.error('Check-in failed. Please try again.'),
  })

  // Check-out mutation
  const checkoutMutation = useMutation({
    mutationFn: () => attendanceService.checkout(),
    onSuccess: () => {
      toast.success('Checked out successfully!')
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] })
    },
    onError: () => toast.error('Check-out failed. Please try again.'),
  })

  // ── Monthly stats computed from history ──
  const stats = useMemo(() => {
    const records = historyData?.results ?? historyData ?? []
    const list    = Array.isArray(records) ? records : []
    return {
      present:   list.filter(r => r.status === 'present').length,
      late:      list.filter(r => r.status === 'late').length,
      halfDay:   list.filter(r => r.status === 'half_day').length,
      absent:    list.filter(r => r.status === 'absent').length,
      totalHours: list.reduce((acc, r) => acc + (parseFloat(r.total_work_hours) || 0), 0),
      list,
    }
  }, [historyData])

  // ── Month navigation ──
  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else              setMonth(m => m - 1)
  }
  function nextMonth() {
    const now = new Date()
    if (year === now.getFullYear() && month === now.getMonth() + 1) return  // cap at current
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else               setMonth(m => m + 1)
  }

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1
  const checkedInToday = todayLog?.login_time
  const checkedOutToday= todayLog?.logout_time

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <CalendarDays className="w-6 h-6 text-indigo-400" />
          My Attendance
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          {formatDate(today.toISOString().slice(0, 10))}
        </p>
      </div>

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
            {/* Times */}
            <div className="flex gap-6 flex-1">
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-0.5">Login</p>
                <p className="text-lg font-bold font-mono text-slate-200">
                  {todayLog?.login_time_str || '—'}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-0.5">Logout</p>
                <p className="text-lg font-bold font-mono text-slate-400">
                  {todayLog?.logout_time_str || '—'}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-0.5">Hours</p>
                <p className="text-lg font-bold text-slate-200">
                  {todayLog?.total_work_hours
                    ? `${Number(todayLog.total_work_hours).toFixed(1)}h`
                    : '—'}
                </p>
              </div>
              {todayLog?.status && (
                <div>
                  <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-0.5">Status</p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[todayLog.status]?.cls || ''}`}>
                    {STATUS_STYLE[todayLog.status]?.label || todayLog.status}
                  </span>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => checkinMutation.mutate()}
                disabled={checkedInToday || checkinMutation.isPending}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  checkedInToday
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-500 text-white'
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
                  !checkedInToday || checkedOutToday
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-red-600 hover:bg-red-500 text-white'
                )}
              >
                <LogOut className="w-4 h-4" />
                {checkoutMutation.isPending ? 'Checking out…' : checkedOutToday ? 'Checked Out' : 'Check Out'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Month picker + stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-slate-200 font-semibold w-36 text-center">
            {MONTHS[month - 1]} {year}
          </span>
          <button
            onClick={nextMonth}
            disabled={isCurrentMonth}
            className={clsx(
              'p-1.5 rounded-lg transition-colors',
              isCurrentMonth
                ? 'text-slate-600 cursor-not-allowed'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            )}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Monthly stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard icon={CheckCircle2} label="Present"    value={stats.present}                        color="green"  />
        <StatCard icon={AlertCircle}  label="Late"       value={stats.late}                           color="yellow" />
        <StatCard icon={Coffee}       label="Half Day"   value={stats.halfDay}                        color="cyan"   />
        <StatCard icon={TrendingUp}   label="Absent"     value={stats.absent}                         color="red"    />
        <StatCard icon={Timer}        label="Total Hours" value={`${stats.totalHours.toFixed(1)}h`}    color="indigo" />
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
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {stats.list.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-slate-500">
                      No records for {MONTHS[month - 1]} {year}.
                    </td>
                  </tr>
                ) : (
                  stats.list.map(record => {
                    const cfg = STATUS_STYLE[record.status] || STATUS_STYLE.absent
                    const dayName = new Date(record.date + 'T00:00:00')
                      .toLocaleDateString('en-US', { weekday: 'short' })
                    return (
                      <tr key={record.id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="px-4 py-3 text-slate-300 font-medium">
                          {formatDate(record.date)}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{dayName}</td>
                        <td className="px-4 py-3 text-center text-slate-300 text-xs font-mono">
                          {record.login_time_str || '—'}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-400 text-xs font-mono">
                          {record.logout_time_str || '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {record.total_work_hours > 0 ? (
                            <span className="text-slate-200 font-medium">
                              {Number(record.total_work_hours).toFixed(1)}h
                            </span>
                          ) : (
                            <span className="text-slate-600 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>
                            {cfg.label}
                          </span>
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
