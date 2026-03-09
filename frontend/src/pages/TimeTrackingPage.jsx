/**
 * TimeTrackingPage — task timer management.
 * Employees: start/stop timers per task, see their own time logs + totals.
 * Managers: see all employees' time logs and summaries.
 */

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Timer, Play, Square, Clock, BarChart3, Search,
  Calendar, ChevronDown, RefreshCw, Zap,
} from 'lucide-react'
import { trackingService, taskService } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { timeAgo, formatDate } from '../utils/helpers'
import toast from 'react-hot-toast'

function formatMinutes(mins) {
  if (!mins) return '0m'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function ElapsedTimer({ startTime }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const start = new Date(startTime).getTime()
    const tick  = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startTime])
  const h = Math.floor(elapsed / 3600)
  const m = Math.floor((elapsed % 3600) / 60)
  const s = elapsed % 60
  return (
    <span className="font-mono text-green-400 text-lg font-bold">
      {h > 0 ? `${h}:` : ''}{String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}
    </span>
  )
}

export default function TimeTrackingPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const isManager = ['founder', 'admin', 'manager', 'hr'].includes(user?.role)

  const [taskSearch, setTaskSearch] = useState('')
  const [notes, setNotes]           = useState('')
  const [dateFilter, setDate]       = useState(new Date().toISOString().slice(0, 10))
  const [empFilter, setEmp]         = useState('')

  // ── Timer summary (totals per task) ──
  const { data: summaryData, refetch: refetchSummary } = useQuery({
    queryKey: ['timer-summary', dateFilter, empFilter],
    queryFn:  () => trackingService.timerSummary({
      date_from: dateFilter, date_to: dateFilter,
      ...(empFilter && { employee: empFilter }),
    }).then(r => r.data),
    refetchInterval: 30000,
  })

  const activeTimer = summaryData?.active_timer ?? null
  const timeSummary = summaryData?.summary ?? []

  // ── My time logs (detailed) ──
  const { data: logsData, isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ['time-logs', dateFilter, empFilter],
    queryFn:  () => trackingService.timerList({
      date: dateFilter,
      ...(empFilter && { employee: empFilter }),
    }).then(r => Array.isArray(r.data) ? r.data : r.data?.results ?? []),
    refetchInterval: 30000,
  })

  const logs = logsData || []

  // ── Task list for starting timer ──
  const { data: tasksData } = useQuery({
    queryKey: ['tasks-for-timer'],
    queryFn:  () => taskService.list({ page_size: 100 }).then(r =>
      Array.isArray(r.data) ? r.data : r.data?.results ?? []
    ),
  })
  const tasks = (tasksData || []).filter(t =>
    !taskSearch || t.name?.toLowerCase().includes(taskSearch.toLowerCase()) || t.task_id?.includes(taskSearch)
  )

  // ── Start timer ──
  const startMutation = useMutation({
    mutationFn: (taskId) => trackingService.timerStart({ task: taskId }),
    onSuccess: () => {
      qc.invalidateQueries(['timer-summary'])
      qc.invalidateQueries(['time-logs'])
      toast.success('Timer started')
      setTaskSearch('')
    },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Failed to start timer'),
  })

  // ── Stop timer ──
  const stopMutation = useMutation({
    mutationFn: ({ id, notes }) => trackingService.timerStop(id, { notes }),
    onSuccess: () => {
      qc.invalidateQueries(['timer-summary'])
      qc.invalidateQueries(['time-logs'])
      toast.success('Timer stopped')
      setNotes('')
    },
    onError: () => toast.error('Failed to stop timer'),
  })

  const handleStop = () => {
    if (activeTimer) stopMutation.mutate({ id: activeTimer.id, notes })
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
            <Timer className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Time Tracking</h1>
            <p className="text-slate-400 text-sm">Track time spent on tasks</p>
          </div>
        </div>
        <button onClick={() => { refetchSummary(); refetchLogs() }}
          className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Active Timer Card */}
      {activeTimer ? (
        <div className="card p-5 border border-green-500/30 bg-green-500/5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-green-400 animate-pulse" />
              </div>
              <div>
                <p className="text-slate-400 text-xs uppercase tracking-wide">Active Timer</p>
                <p className="text-white font-semibold">{activeTimer.task_title}</p>
                <p className="text-slate-400 text-xs">{activeTimer.task_id_code}</p>
              </div>
              <ElapsedTimer startTime={activeTimer.start_time} />
            </div>
            <div className="flex items-center gap-3">
              <input value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Stop notes (optional)" className="input-field text-sm w-56" />
              <button onClick={handleStop} disabled={stopMutation.isPending}
                className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-xl px-4 py-2 text-sm font-medium transition-colors">
                <Square className="w-4 h-4" />
                {stopMutation.isPending ? 'Stopping…' : 'Stop Timer'}
              </button>
            </div>
          </div>
        </div>
      ) : !isManager && (
        <div className="card p-4 border border-dashed border-slate-600 flex items-center gap-3 text-slate-400 text-sm">
          <Timer className="w-5 h-5 opacity-50" />
          No active timer — start one from a task below
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Start Timer Panel (employees) */}
        {!isManager && (
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Play className="w-4 h-4 text-green-400" /> Start Timer
            </h2>
            <div>
              <label className="label">Search Task</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={taskSearch} onChange={e => setTaskSearch(e.target.value)}
                  placeholder="Task name or ID…" className="input-field pl-9 w-full" />
              </div>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {tasks.length === 0 && taskSearch && (
                <p className="text-slate-400 text-sm text-center py-4">No in-progress tasks found</p>
              )}
              {tasks.length === 0 && !taskSearch && (
                <p className="text-slate-400 text-sm text-center py-4">
                  No in-progress tasks assigned to you
                </p>
              )}
              {tasks.map(task => (
                <button key={task.id}
                  onClick={() => !activeTimer && startMutation.mutate(task.id)}
                  disabled={!!activeTimer || startMutation.isPending}
                  className={`w-full text-left p-3 rounded-xl border transition-colors ${
                    activeTimer
                      ? 'border-slate-700 bg-slate-800/50 opacity-50 cursor-not-allowed'
                      : 'border-slate-700 bg-slate-800/50 hover:border-green-500/40 hover:bg-green-500/5'
                  }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white text-sm font-medium line-clamp-1">{task.name}</p>
                      <p className="text-slate-400 text-xs">{task.task_id} · {task.priority}</p>
                    </div>
                    {!activeTimer && (
                      <Play className="w-4 h-4 text-green-400 flex-shrink-0" />
                    )}
                  </div>
                </button>
              ))}
            </div>
            {activeTimer && (
              <p className="text-xs text-yellow-400 text-center">Stop current timer first to start a new one</p>
            )}
          </div>
        )}

        {/* Summary + Logs */}
        <div className={`space-y-5 ${isManager ? 'xl:col-span-3' : 'xl:col-span-2'}`}>
          {/* Date filter */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="label">Date</label>
              <input type="date" value={dateFilter}
                onChange={e => setDate(e.target.value)} className="input-field" />
            </div>
            {isManager && (
              <div className="w-48">
                <label className="label">Employee ID</label>
                <input value={empFilter} onChange={e => setEmp(e.target.value)}
                  placeholder="Filter by employee…" className="input-field" />
              </div>
            )}
          </div>

          {/* Time Summary per Task */}
          {timeSummary.length > 0 && (
            <div className="card p-4">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-400" /> Time Summary
              </h3>
              <div className="space-y-2">
                {timeSummary.map(t => {
                  const maxMins = Math.max(...timeSummary.map(x => x.total_minutes || 0), 1)
                  const pct     = Math.round((t.total_minutes / maxMins) * 100)
                  return (
                    <div key={t.task__id} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white truncate max-w-xs">{t.task__name}</span>
                        <span className="text-slate-400 ml-3 flex-shrink-0">
                          {formatMinutes(t.total_minutes)} · {t.sessions} session{t.sessions !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
                <div className="pt-2 border-t border-slate-700 flex justify-between text-sm">
                  <span className="text-slate-400">Total</span>
                  <span className="text-white font-medium">
                    {formatMinutes(timeSummary.reduce((a, t) => a + (t.total_minutes || 0), 0))}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Detailed Log Table */}
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-slate-700">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                Time Logs — {formatDate(dateFilter)}
              </h3>
            </div>
            {logsLoading ? (
              <div className="p-8 text-center text-slate-400">Loading…</div>
            ) : logs.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>No time logs for this date</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800/50">
                    <tr className="text-left text-slate-400">
                      {isManager && <th className="px-4 py-3 font-medium">Employee</th>}
                      <th className="px-4 py-3 font-medium">Task</th>
                      <th className="px-4 py-3 font-medium">Start</th>
                      <th className="px-4 py-3 font-medium">End</th>
                      <th className="px-4 py-3 font-medium">Duration</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => (
                      <tr key={log.id} className="border-t border-slate-700/50 hover:bg-slate-700/20">
                        {isManager && (
                          <td className="px-4 py-3">
                            <p className="text-white text-xs font-medium">{log.employee_name}</p>
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <p className="text-white font-medium line-clamp-1">{log.task_title}</p>
                          <p className="text-slate-500 text-xs">{log.task_id_code}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-300 text-xs">
                          {log.start_time ? new Date(log.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-300 text-xs">
                          {log.end_time ? new Date(log.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (
                            <span className="text-green-400">Running</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-white font-medium">
                          {log.is_active ? (
                            <ElapsedTimer startTime={log.start_time} />
                          ) : formatMinutes(log.duration_minutes)}
                        </td>
                        <td className="px-4 py-3">
                          {log.is_active ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Active
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded-full">Done</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs max-w-[150px] truncate">{log.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
