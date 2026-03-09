/**
 * DailyReportPage
 *
 * Employees: submit / edit today's daily work report.
 * Managers+: list all reports with filter + review (approve/reject).
 */

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Send, CheckCircle2, XCircle, Clock, ChevronDown,
  Filter, Users, Calendar, RefreshCw, Eye, AlertCircle,
} from 'lucide-react'
import { trackingService } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { formatDate, timeAgo } from '../utils/helpers'
import toast from 'react-hot-toast'

const STATUS_STYLES = {
  draft:     'bg-slate-500/10 text-slate-400 border border-slate-500/20',
  submitted: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  reviewed:  'bg-green-500/10 text-green-400 border border-green-500/20',
  rejected:  'bg-red-500/10 text-red-400 border border-red-500/20',
}

export default function DailyReportPage() {
  const { user } = useAuthStore()
  const isManager = ['founder', 'admin', 'manager', 'hr'].includes(user?.role)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
          <FileText className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Daily Work Reports</h1>
          <p className="text-slate-400 text-sm">
            {isManager ? 'Review employee daily reports' : 'Submit and track your daily work'}
          </p>
        </div>
      </div>

      {isManager ? <ManagerView /> : <EmployeeView />}
    </div>
  )
}

/* ── Employee View ── */
function EmployeeView() {
  const qc = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data: myReports, isLoading } = useQuery({
    queryKey: ['my-daily-reports'],
    queryFn:  () => trackingService.reportList().then(r =>
      Array.isArray(r.data) ? r.data : r.data?.results ?? []
    ),
  })

  const todayReport = myReports?.find(r => r.report_date === today)

  const [form, setForm] = useState({
    report_date:       today,
    tasks_assigned:    '',
    tasks_completed:   '',
    tasks_pending:     '',
    hours_worked:      '',
    work_description:  '',
    blockers:          '',
    plan_for_tomorrow: '',
    status:            'draft',
  })

  // Pre-fill from existing report
  useEffect(() => {
    if (todayReport) {
      setForm({
        report_date:       todayReport.report_date,
        tasks_assigned:    todayReport.tasks_assigned,
        tasks_completed:   todayReport.tasks_completed,
        tasks_pending:     todayReport.tasks_pending,
        hours_worked:      todayReport.hours_worked,
        work_description:  todayReport.work_description,
        blockers:          todayReport.blockers,
        plan_for_tomorrow: todayReport.plan_for_tomorrow,
        status:            todayReport.status,
      })
    }
  }, [todayReport?.id])

  const saveMutation = useMutation({
    mutationFn: (data) => todayReport
      ? trackingService.reportUpdate(todayReport.id, data)
      : trackingService.reportCreate(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-daily-reports'] })
      toast.success('Report saved')
    },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Failed to save'),
  })

  const handleSave = (submitStatus) => {
    const data = {
      ...form,
      tasks_assigned:  Number(form.tasks_assigned) || 0,
      tasks_completed: Number(form.tasks_completed) || 0,
      tasks_pending:   Number(form.tasks_pending) || 0,
      hours_worked:    Number(form.hours_worked) || 0,
      status:          submitStatus,
    }
    saveMutation.mutate(data)
  }

  const f = (k) => e => setForm(prev => ({ ...prev, [k]: e.target.value }))

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* Form */}
      <div className="xl:col-span-2 card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">
            Today's Report — {formatDate(today)}
          </h2>
          {todayReport && (
            <span className={`badge text-xs px-2 py-1 rounded-full ${STATUS_STYLES[todayReport.status]}`}>
              {todayReport.status}
            </span>
          )}
        </div>

        {todayReport?.status === 'reviewed' && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-sm text-green-400 flex gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Report Reviewed</p>
              {todayReport.review_comment && <p className="text-green-300 mt-0.5">{todayReport.review_comment}</p>}
            </div>
          </div>
        )}
        {todayReport?.status === 'rejected' && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400 flex gap-2">
            <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Report Rejected</p>
              {todayReport.review_comment && <p className="text-red-300 mt-0.5">{todayReport.review_comment}</p>}
            </div>
          </div>
        )}

        {/* Task counts */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { key: 'tasks_assigned',  label: 'Tasks Assigned' },
            { key: 'tasks_completed', label: 'Tasks Completed' },
            { key: 'tasks_pending',   label: 'Tasks Pending' },
            { key: 'hours_worked',    label: 'Hours Worked' },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input type="number" min="0" step={key === 'hours_worked' ? '0.5' : '1'}
                value={form[key]} onChange={f(key)} className="input-field" placeholder="0" />
            </div>
          ))}
        </div>

        {/* Text areas */}
        <div>
          <label className="label">What did you work on today? *</label>
          <textarea value={form.work_description} onChange={f('work_description')}
            className="input-field resize-none" rows={4}
            placeholder="Summarize the main tasks and progress you made today…" />
        </div>
        <div>
          <label className="label">Blockers / Issues</label>
          <textarea value={form.blockers} onChange={f('blockers')}
            className="input-field resize-none" rows={3}
            placeholder="Any blockers, dependencies, or issues that slowed you down?" />
        </div>
        <div>
          <label className="label">Plan for Tomorrow</label>
          <textarea value={form.plan_for_tomorrow} onChange={f('plan_for_tomorrow')}
            className="input-field resize-none" rows={3}
            placeholder="What do you plan to work on tomorrow?" />
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={() => handleSave('draft')} disabled={saveMutation.isPending}
            className="btn-secondary flex items-center gap-2 text-sm">
            Save Draft
          </button>
          <button onClick={() => handleSave('submitted')} disabled={saveMutation.isPending}
            className="btn-primary flex items-center gap-2 text-sm">
            <Send className="w-4 h-4" />
            {saveMutation.isPending ? 'Submitting…' : 'Submit Report'}
          </button>
        </div>
      </div>

      {/* History */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide px-1">
          Recent Reports
        </h3>
        {isLoading ? (
          <div className="card p-4 text-slate-400 text-sm">Loading…</div>
        ) : myReports?.length === 0 ? (
          <div className="card p-4 text-slate-400 text-sm text-center">No reports yet</div>
        ) : myReports?.slice(0, 8).map(r => (
          <div key={r.id} className="card p-3 hover:border-indigo-500/30 transition-colors">
            <div className="flex items-center justify-between mb-1">
              <span className="text-white text-sm font-medium">{formatDate(r.report_date)}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[r.status]}`}>{r.status}</span>
            </div>
            <div className="flex gap-3 text-xs text-slate-400">
              <span>✓ {r.tasks_completed}/{r.tasks_assigned} tasks</span>
              <span>{r.hours_worked}h</span>
              <span>{r.completion_rate}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Manager View ── */
function ManagerView() {
  const qc = useQueryClient()
  const [filters, setFilters] = useState({ status: '', date_from: '', date_to: '' })
  const [reviewModal, setReviewModal] = useState(null) // report object

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['all-daily-reports', filters],
    queryFn:  () => trackingService.reportList(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
    ).then(r => Array.isArray(r.data) ? r.data : r.data?.results ?? []),
  })

  const reports = data || []

  const reviewMutation = useMutation({
    mutationFn: ({ id, action, comment }) => trackingService.reportReview(id, { action, comment }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-daily-reports'] })
      setReviewModal(null)
      toast.success('Report reviewed')
    },
    onError: () => toast.error('Review failed'),
  })

  const f = (k) => e => setFilters(prev => ({ ...prev, [k]: e.target.value }))

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Status</label>
          <select value={filters.status} onChange={f('status')} className="input-field w-36">
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="reviewed">Reviewed</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div>
          <label className="label">Date From</label>
          <input type="date" value={filters.date_from} onChange={f('date_from')} className="input-field" />
        </div>
        <div>
          <label className="label">Date To</label>
          <input type="date" value={filters.date_to} onChange={f('date_to')} className="input-field" />
        </div>
        <button onClick={() => refetch()} className="btn-primary text-sm">
          <Filter className="w-4 h-4 inline mr-1" /> Filter
        </button>
        <button onClick={() => setFilters({ status: '', date_from: '', date_to: '' })}
          className="btn-secondary text-sm">Clear</button>
      </div>

      {/* Pending review banner */}
      {reports.filter(r => r.status === 'submitted').length > 0 && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 flex items-center gap-2 text-orange-400 text-sm">
          <AlertCircle className="w-4 h-4" />
          {reports.filter(r => r.status === 'submitted').length} reports pending review
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">Loading reports…</div>
        ) : reports.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>No reports found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50">
                <tr className="text-left text-slate-400">
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium text-center">Tasks</th>
                  <th className="px-4 py-3 font-medium text-center">Hours</th>
                  <th className="px-4 py-3 font-medium text-center">Completion</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.id} className="border-t border-slate-700/50 hover:bg-slate-700/30">
                    <td className="px-4 py-3">
                      <p className="text-white font-medium">{r.employee_name}</p>
                      <p className="text-slate-400 text-xs">{r.department_name} · {r.employee_code}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{formatDate(r.report_date)}</td>
                    <td className="px-4 py-3 text-center text-slate-300">{r.tasks_completed}/{r.tasks_assigned}</td>
                    <td className="px-4 py-3 text-center text-slate-300">{r.hours_worked}h</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        r.completion_rate >= 80 ? 'bg-green-500/10 text-green-400' :
                        r.completion_rate >= 50 ? 'bg-yellow-500/10 text-yellow-400' :
                        'bg-red-500/10 text-red-400'
                      }`}>{r.completion_rate}%</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[r.status]}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setReviewModal(r)}
                        className="btn-secondary text-xs flex items-center gap-1 py-1 px-2">
                        <Eye className="w-3 h-3" /> Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review Modal */}
      {reviewModal && (
        <ReviewModal
          report={reviewModal}
          onClose={() => setReviewModal(null)}
          onReview={(action, comment) => reviewMutation.mutate({ id: reviewModal.id, action, comment })}
          loading={reviewMutation.isPending}
        />
      )}
    </div>
  )
}

function ReviewModal({ report, onClose, onReview, loading }) {
  const [comment, setComment] = useState('')

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-400" />
            Review Daily Report
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-slate-400">Employee</p>
              <p className="text-white font-medium">{report.employee_name}</p>
            </div>
            <div>
              <p className="text-slate-400">Date</p>
              <p className="text-white">{formatDate(report.report_date)}</p>
            </div>
            <div>
              <p className="text-slate-400">Tasks</p>
              <p className="text-white">{report.tasks_completed}/{report.tasks_assigned} ({report.completion_rate}%)</p>
            </div>
            <div>
              <p className="text-slate-400">Hours</p>
              <p className="text-white">{report.hours_worked}h</p>
            </div>
          </div>
          {report.work_description && (
            <div>
              <p className="text-slate-400 text-sm mb-1">Work Description</p>
              <p className="text-slate-300 text-sm bg-slate-900/50 rounded-lg p-3">{report.work_description}</p>
            </div>
          )}
          {report.blockers && (
            <div>
              <p className="text-slate-400 text-sm mb-1">Blockers</p>
              <p className="text-slate-300 text-sm bg-red-500/5 border border-red-500/20 rounded-lg p-3">{report.blockers}</p>
            </div>
          )}
          {report.plan_for_tomorrow && (
            <div>
              <p className="text-slate-400 text-sm mb-1">Plan for Tomorrow</p>
              <p className="text-slate-300 text-sm bg-slate-900/50 rounded-lg p-3">{report.plan_for_tomorrow}</p>
            </div>
          )}
          <div>
            <label className="label">Review Comment</label>
            <textarea value={comment} onChange={e => setComment(e.target.value)}
              className="input-field resize-none" rows={3}
              placeholder="Optional comment for the employee…" />
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-slate-700">
          <button onClick={() => onReview('approve', comment)} disabled={loading}
            className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4" />
            {loading ? 'Saving…' : 'Approve'}
          </button>
          <button onClick={() => onReview('reject', comment)} disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 text-sm py-2 px-4 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors">
            <XCircle className="w-4 h-4" />
            Reject
          </button>
          <button onClick={onClose} className="btn-secondary text-sm px-4">Cancel</button>
        </div>
      </div>
    </div>
  )
}
