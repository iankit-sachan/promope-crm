import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { taskService } from '../services/api'
import {
  ArrowLeft, Clock, Calendar, User, Building2,
  AlertTriangle, MessageSquare, Paperclip, Upload
} from 'lucide-react'
import {
  formatDate, timeAgo, getStatusClass, getPriorityClass,
  statusLabel, initials
} from '../utils/helpers'
import ProgressBar from '../components/common/ProgressBar'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const STATUSES = ['pending', 'in_progress', 'completed', 'delayed', 'cancelled']

export default function TaskDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const [comment, setComment] = useState('')
  const [editingProgress, setEditingProgress] = useState(false)
  const [newProgress, setNewProgress] = useState(0)
  const [newStatus, setNewStatus] = useState('')

  const { data: task, isLoading } = useQuery({
    queryKey: ['task', id],
    queryFn: () => taskService.get(id).then(r => r.data),
  })

  const progressMutation = useMutation({
    mutationFn: (data) => taskService.updateProgress(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', id] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      setEditingProgress(false)
      toast.success('Progress updated!')
    },
  })

  const commentMutation = useMutation({
    mutationFn: (content) => taskService.addComment(id, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', id] })
      setComment('')
      toast.success('Comment added')
    },
  })

  if (isLoading) return <LoadingSpinner text="Loading task..." />
  if (!task) return <div className="text-slate-400 text-center py-20">Task not found.</div>

  const handleProgressSave = () => {
    const payload = {}
    if (newProgress !== task.progress) payload.progress = newProgress
    if (newStatus && newStatus !== task.status) payload.status = newStatus
    if (Object.keys(payload).length) progressMutation.mutate(payload)
    else setEditingProgress(false)
  }

  const timeline = task.history || []

  return (
    <div className="space-y-6">
      <button onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Tasks
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-5">
          {/* Task header */}
          <div className="card">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-slate-500 font-mono">{task.task_id}</span>
                  <span className={getPriorityClass(task.priority)}>{task.priority}</span>
                  {task.is_overdue && (
                    <span className="badge bg-red-500/10 text-red-400 border border-red-500/20">
                      <AlertTriangle className="w-3 h-3 mr-1" />Overdue
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-bold text-white">{task.name}</h1>
              </div>
              <span className={getStatusClass(task.status)}>{statusLabel(task.status)}</span>
            </div>

            {task.description && (
              <p className="text-slate-400 text-sm leading-relaxed mb-4">{task.description}</p>
            )}

            {/* Progress section */}
            <div className="bg-slate-700/30 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">Progress</span>
                {!editingProgress ? (
                  <button
                    onClick={() => {
                      setNewProgress(task.progress)
                      setNewStatus(task.status)
                      setEditingProgress(true)
                    }}
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    Update
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => setEditingProgress(false)}
                      className="text-xs text-slate-400 hover:text-slate-200">Cancel</button>
                    <button onClick={handleProgressSave}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">Save</button>
                  </div>
                )}
              </div>

              {editingProgress ? (
                <div className="space-y-3">
                  <div>
                    <label className="label">Status</label>
                    <select className="input" value={newStatus}
                      onChange={e => setNewStatus(e.target.value)}>
                      {STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Progress: {newProgress}%</label>
                    <input type="range" min="0" max="100" value={newProgress}
                      onChange={e => setNewProgress(Number(e.target.value))}
                      className="w-full accent-indigo-500" />
                  </div>
                </div>
              ) : (
                <ProgressBar value={task.progress} size="lg" />
              )}
            </div>
          </div>

          {/* Comments */}
          <div className="card">
            <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-indigo-400" />
              Comments ({task.comments?.length || 0})
            </h3>

            {/* Add comment */}
            <div className="flex gap-3 mb-4">
              <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
                {initials(user?.full_name)}
              </div>
              <div className="flex-1">
                <textarea
                  className="input resize-none"
                  rows={2}
                  placeholder="Add a comment..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.ctrlKey && comment.trim()) {
                      commentMutation.mutate(comment.trim())
                    }
                  }}
                />
                {comment.trim() && (
                  <button
                    onClick={() => commentMutation.mutate(comment.trim())}
                    disabled={commentMutation.isPending}
                    className="btn-primary mt-2 py-1.5 text-xs"
                  >
                    {commentMutation.isPending ? 'Posting...' : 'Post Comment'}
                  </button>
                )}
              </div>
            </div>

            {/* Comment list */}
            <div className="space-y-3">
              {(task.comments || []).map((c) => (
                <div key={c.id} className="flex gap-3">
                  <div className="w-7 h-7 bg-slate-600 rounded-full flex items-center justify-center text-[10px] font-semibold text-slate-300 flex-shrink-0 mt-0.5">
                    {initials(c.author_name)}
                  </div>
                  <div className="flex-1 bg-slate-700/30 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-200">{c.author_name}</span>
                      <span className="text-xs text-slate-500">{timeAgo(c.created_at)}</span>
                    </div>
                    <p className="text-sm text-slate-400">{c.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Task info */}
          <div className="card space-y-3">
            <h3 className="font-semibold text-sm mb-1">Task Details</h3>

            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-slate-500" />
              <span className="text-slate-400">Assigned to</span>
              <span className="text-slate-200 font-medium ml-auto">
                {task.assigned_to_detail?.full_name || '—'}
              </span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <Building2 className="w-4 h-4 text-slate-500" />
              <span className="text-slate-400">Department</span>
              <span className="text-slate-200 ml-auto">{task.department_name || '—'}</span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span className="text-slate-400">Start Date</span>
              <span className="text-slate-200 ml-auto">{formatDate(task.start_date)}</span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-slate-500" />
              <span className="text-slate-400">Deadline</span>
              <span className={clsx('ml-auto font-medium', task.is_overdue ? 'text-red-400' : 'text-slate-200')}>
                {formatDate(task.deadline)}
              </span>
            </div>

            {task.completed_at && (
              <div className="flex items-center gap-2 text-sm">
                <span className="w-4 h-4 text-slate-500">✓</span>
                <span className="text-slate-400">Completed</span>
                <span className="text-green-400 ml-auto">{formatDate(task.completed_at)}</span>
              </div>
            )}
          </div>

          {/* Attachments */}
          {(task.attachments || []).length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-indigo-400" />
                Attachments ({task.attachments.length})
              </h3>
              {task.attachments.map((att) => (
                <a key={att.id} href={att.file} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-700/30 transition-colors text-sm text-indigo-400 hover:text-indigo-300">
                  <Paperclip className="w-3.5 h-3.5" />
                  <span className="truncate">{att.filename}</span>
                </a>
              ))}
            </div>
          )}

          {/* Task history timeline */}
          <div className="card">
            <h3 className="font-semibold text-sm mb-4">Task Timeline</h3>
            {timeline.length === 0 ? (
              <p className="text-slate-500 text-xs text-center py-4">No history yet</p>
            ) : (
              <div className="relative pl-5 space-y-3">
                <div className="absolute left-1.5 top-0 bottom-0 w-px bg-slate-700" />
                {timeline.map((entry) => (
                  <div key={entry.id} className="relative">
                    <div className="absolute -left-3.5 w-2 h-2 bg-indigo-500 rounded-full mt-1" />
                    <p className="text-xs text-slate-300">
                      <span className="font-medium">{entry.changed_by_name}</span>
                      {' changed '}{entry.field_name}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {entry.old_value} → <span className="text-slate-300">{entry.new_value}</span>
                    </p>
                    <p className="text-[10px] text-slate-600 mt-0.5">{timeAgo(entry.changed_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
