/**
 * WorkLogPage — Employee daily work log submission.
 * Employees mark which tasks they worked on, which they completed,
 * which are blocked, then submit their hours + description.
 */
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardCheck, Clock, CheckCircle2, XCircle,
  AlertCircle, Send, Save, RefreshCw,
} from 'lucide-react'
import { worklogService, taskService } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { formatDate, getStatusClass, getPriorityClass } from '../utils/helpers'
import LoadingSpinner from '../components/common/LoadingSpinner'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const today = new Date().toISOString().slice(0, 10)

// ── task checkbox row ─────────────────────────────────────────────────────────

function TaskRow({ task, selected, completed, blocked, onToggle }) {
  return (
    <div className={clsx(
      'flex items-center gap-3 p-3 rounded-xl border transition-all',
      selected
        ? 'border-indigo-500/50 bg-indigo-500/5'
        : 'border-slate-700 bg-slate-800/30',
    )}>
      {/* Select (worked on today) */}
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle('assigned', task.id)}
        className="w-4 h-4 accent-indigo-500 shrink-0 cursor-pointer"
        title="Worked on today"
      />

      {/* Task info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-slate-200 truncate max-w-[200px]">{task.name}</p>
          <span className={`badge text-[10px] ${getPriorityClass(task.priority)}`}>{task.priority}</span>
          <span className={`badge text-[10px] ${getStatusClass(task.status)}`}>{task.status.replace('_', ' ')}</span>
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5">
          {task.task_id} · {task.deadline ? `Due ${formatDate(task.deadline)}` : 'No deadline'}
          {task.expected_hours ? ` · ${task.expected_hours}h est.` : ''}
        </p>
      </div>

      {/* Completed + Blocked toggles (only active when selected) */}
      {selected && (
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onToggle('completed', task.id)}
            className={clsx(
              'flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors',
              completed
                ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                : 'bg-slate-700 text-slate-400 border border-slate-600 hover:border-green-500/40',
            )}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Done
          </button>
          <button
            type="button"
            onClick={() => onToggle('blocked', task.id)}
            className={clsx(
              'flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors',
              blocked
                ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                : 'bg-slate-700 text-slate-400 border border-slate-600 hover:border-red-500/40',
            )}
          >
            <XCircle className="w-3.5 h-3.5" />
            Blocked
          </button>
        </div>
      )}
    </div>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function WorkLogPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()

  // Only employees and managers have an employee_profile and can submit logs
  const canSubmitLog = user?.role === 'employee' || user?.role === 'manager'

  const [hours, setHours]       = useState('')
  const [desc, setDesc]         = useState('')
  const [assigned, setAssigned] = useState(new Set()) // task IDs worked on
  const [completed, setCompleted] = useState(new Set())
  const [blocked, setBlocked]   = useState(new Set())
  const [logId, setLogId]       = useState(null)

  // Load today's work log — only when the user has an employee profile
  const { data: todayLog, isLoading: loadingLog, refetch } = useQuery({
    queryKey: ['worklog-today'],
    queryFn:  () => worklogService.today().then(r => r.data),
    enabled:  canSubmitLog,
    retry:    false,
  })

  // Load my tasks (assigned, in-progress, pending) — only when applicable
  const { data: tasksData, isLoading: loadingTasks } = useQuery({
    queryKey: ['my-tasks'],
    queryFn:  () => taskService.list({ page_size: 50 }).then(r => r.data),
    enabled:  canSubmitLog,
  })

  const myTasks = (tasksData?.results || tasksData || []).filter(
    t => t.status !== 'completed' && t.status !== 'cancelled'
  )

  // Pre-fill form from existing log
  useEffect(() => {
    if (todayLog) {
      setLogId(todayLog.id)
      setHours(todayLog.hours_worked?.toString() || '')
      setDesc(todayLog.work_description || '')
      setAssigned(new Set((todayLog.tasks_assigned || []).map(Number)))
      setCompleted(new Set((todayLog.tasks_completed || []).map(Number)))
      setBlocked(new Set((todayLog.tasks_blocked || []).map(Number)))
    }
  }, [todayLog])

  const handleToggle = (type, taskId) => {
    if (type === 'assigned') {
      setAssigned(prev => {
        const next = new Set(prev)
        if (next.has(taskId)) {
          next.delete(taskId)
          // Remove from completed/blocked if deselected
          setCompleted(c => { const s = new Set(c); s.delete(taskId); return s })
          setBlocked(b => { const s = new Set(b); s.delete(taskId); return s })
        } else {
          next.add(taskId)
        }
        return next
      })
    } else if (type === 'completed') {
      setCompleted(prev => {
        const next = new Set(prev)
        next.has(taskId) ? next.delete(taskId) : next.add(taskId)
        return next
      })
    } else if (type === 'blocked') {
      setBlocked(prev => {
        const next = new Set(prev)
        next.has(taskId) ? next.delete(taskId) : next.add(taskId)
        return next
      })
    }
  }

  const buildPayload = (logStatus) => ({
    date:             today,
    work_description: desc.trim(),
    hours_worked:     parseFloat(hours) || 0,
    tasks_assigned:   [...assigned],
    tasks_completed:  [...completed],
    tasks_blocked:    [...blocked],
    status:           logStatus,
  })

  const saveMutation = useMutation({
    mutationFn: (payload) =>
      logId
        ? worklogService.update(logId, payload)
        : worklogService.create(payload),
    onSuccess: (res) => {
      setLogId(res.data.id)
      qc.invalidateQueries({ queryKey: ['worklog-today'] })
      toast.success(res.data.status === 'submitted' ? 'Work log submitted!' : 'Draft saved')
    },
    onError: () => toast.error('Failed to save log'),
  })

  const handleSave   = () => saveMutation.mutate(buildPayload('draft'))
  const handleSubmit = () => {
    if (!desc.trim()) { toast.error('Please write a work description before submitting.'); return }
    if (!hours || parseFloat(hours) <= 0) { toast.error('Please enter hours worked.'); return }
    saveMutation.mutate(buildPayload('submitted'))
  }

  // Founders / admins don't have employee profiles — show a graceful notice
  if (!canSubmitLog) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="card text-center py-16 space-y-3">
          <ClipboardCheck className="w-12 h-12 text-slate-600 mx-auto" />
          <h2 className="text-lg font-semibold text-slate-300">Work Log Not Available</h2>
          <p className="text-slate-500 text-sm max-w-sm mx-auto">
            Daily work logs are submitted by <strong className="text-slate-400">employees</strong> and{' '}
            <strong className="text-slate-400">managers</strong>. Visit the{' '}
            <a href="/reports" className="text-indigo-400 hover:underline">Reports</a> page to view team submissions.
          </p>
        </div>
      </div>
    )
  }

  if (loadingLog || loadingTasks) return <LoadingSpinner text="Loading your work log…" />

  const isSubmitted = todayLog?.status === 'submitted'
  const completedCount = completed.size
  const assignedCount  = assigned.size

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-indigo-400" />
            Daily Work Log
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {formatDate(today)} · {user?.full_name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSubmitted && (
            <span className="badge status-completed text-xs">Submitted</span>
          )}
          <button
            onClick={() => refetch()}
            className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Summary mini-stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: ClipboardCheck, label: 'Worked On',  value: assignedCount,  color: 'text-indigo-400' },
          { icon: CheckCircle2,   label: 'Completed',  value: completedCount, color: 'text-green-400' },
          { icon: XCircle,        label: 'Blocked',    value: blocked.size,   color: 'text-red-400' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="card flex items-center gap-3 py-3">
            <Icon className={`w-5 h-5 ${color} shrink-0`} />
            <div>
              <p className="text-lg font-bold text-white">{value}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Task selection */}
      <div className="card space-y-3">
        <h2 className="font-semibold text-slate-200 flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-indigo-400" />
          Your Tasks — tick what you worked on today
        </h2>
        {myTasks.length === 0 ? (
          <p className="text-slate-500 text-sm py-4 text-center">No active tasks assigned to you</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {myTasks.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                selected={assigned.has(task.id)}
                completed={completed.has(task.id)}
                blocked={blocked.has(task.id)}
                onToggle={handleToggle}
              />
            ))}
          </div>
        )}
      </div>

      {/* Hours + description */}
      <div className="card space-y-4">
        <div>
          <label className="label flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            Hours Worked Today *
          </label>
          <input
            type="number"
            min="0" max="24" step="0.5"
            placeholder="e.g. 8 or 7.5"
            className="input w-40"
            value={hours}
            onChange={e => setHours(e.target.value)}
          />
        </div>

        <div>
          <label className="label flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            Work Description *
            <span className="text-slate-500 font-normal ml-1">(What did you accomplish today?)</span>
          </label>
          <textarea
            className="input resize-none"
            rows={4}
            placeholder="Summarize what you worked on, any blockers, and progress made…"
            value={desc}
            onChange={e => setDesc(e.target.value)}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="btn-secondary flex-1 justify-center"
        >
          {saveMutation.isPending ? (
            <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save Draft
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saveMutation.isPending || isSubmitted}
          className="btn-primary flex-1 justify-center"
        >
          {saveMutation.isPending ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {isSubmitted ? 'Already Submitted' : 'Submit Work Log'}
        </button>
      </div>

      {isSubmitted && (
        <p className="text-center text-sm text-slate-500">
          Your log for today has been submitted. You can still update it before end of day.
        </p>
      )}
    </div>
  )
}
