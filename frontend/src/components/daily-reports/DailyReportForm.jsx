import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { dailyReportService } from '../../services/api'
import { formatDate } from '../../utils/helpers'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { FileText, Upload, CheckCircle, Clock, Paperclip, X, Image, Plus, ChevronDown, ChevronUp } from 'lucide-react'

const today = new Date().toISOString().split('T')[0]

const STATUS_BADGE = {
  pending:   'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  submitted: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  reviewed:  'bg-green-500/20 text-green-400 border border-green-500/30',
}

const EMPTY_FORM = {
  report_date:      today,
  tasks_assigned:   '',
  tasks_completed:  '',
  tasks_pending:    '',
  hours_worked:     '',
  work_description: '',
  blockers:         '',
}

export default function DailyReportForm() {
  const qc = useQueryClient()
  const [form, setForm] = useState(EMPTY_FORM)
  const [newFiles, setNewFiles] = useState([])
  const [editingReport, setEditingReport] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  // Load ALL of today's reports
  const { data: todayReports, isLoading } = useQuery({
    queryKey: ['daily-report-today'],
    queryFn: () => dailyReportService.list({ date: today }).then(r => {
      const list = Array.isArray(r.data) ? r.data : r.data?.results ?? []
      return list
    }),
  })

  const reports = todayReports || []
  const hasPendingDraft = reports.some(r => r.status === 'pending')

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setNewFiles([])
    setEditingReport(null)
  }

  const openNewReport = () => {
    resetForm()
    setShowForm(true)
  }

  const openEditReport = (report) => {
    setEditingReport(report)
    setForm({
      report_date:      report.report_date,
      tasks_assigned:   report.tasks_assigned   || '',
      tasks_completed:  report.tasks_completed  || '',
      tasks_pending:    report.tasks_pending    || '',
      hours_worked:     report.hours_worked     || '',
      work_description: report.work_description || '',
      blockers:         report.blockers         || '',
    })
    setNewFiles([])
    setShowForm(true)
  }

  const cancelForm = () => {
    resetForm()
    setShowForm(false)
  }

  const f = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }))

  const buildFormData = () => {
    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => { if (v !== '') fd.append(k, v) })
    newFiles.forEach(f => fd.append('attachments', f))
    return fd
  }

  const removeNewFile = (idx) => setNewFiles(prev => prev.filter((_, i) => i !== idx))

  const handleDeleteAttachment = async (id) => {
    try {
      await api.delete(`/daily-reports/attachments/${id}/`)
      qc.invalidateQueries({ queryKey: ['daily-report-today'] })
      qc.invalidateQueries({ queryKey: ['my-daily-reports'] })
      toast.success('Attachment removed')
    } catch {
      toast.error('Failed to remove attachment')
    }
  }

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['daily-report-today'] })
    qc.invalidateQueries({ queryKey: ['my-daily-reports'] })
  }

  // Save Draft
  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = buildFormData()
      if (editingReport) return dailyReportService.update(editingReport.id, payload)
      return dailyReportService.create(payload)
    },
    onSuccess: () => {
      invalidateAll()
      toast.success('Report saved as draft')
      cancelForm()
    },
    onError: (err) => {
      const msg = err.response?.data?.detail || err.response?.data?.report_date?.[0] || 'Failed to save'
      toast.error(msg)
    },
  })

  // Submit Report
  const submitMutation = useMutation({
    mutationFn: async () => {
      let report = editingReport
      const payload = buildFormData()
      if (!report) {
        const res = await dailyReportService.create(payload)
        report = res.data
      } else {
        const res = await dailyReportService.update(report.id, payload)
        report = res.data
      }
      return dailyReportService.submit(report.id)
    },
    onSuccess: () => {
      invalidateAll()
      toast.success('Daily report submitted successfully!')
      cancelForm()
    },
    onError: (err) => {
      const msg = err.response?.data?.detail || 'Submission failed'
      toast.error(msg)
    },
  })

  const isBusy = saveMutation.isPending || submitMutation.isPending

  if (isLoading) {
    return (
      <div className="card p-6 flex items-center justify-center h-40">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header + New Report button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
            <FileText className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="font-semibold text-white">Today's Reports</h2>
            <p className="text-xs text-slate-400">{formatDate(today)} · {reports.length} report{reports.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        {!showForm && (
          <button onClick={openNewReport} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> New Report
          </button>
        )}
      </div>

      {/* New / Edit Form */}
      {showForm && (
        <div className="card p-6 space-y-6 border border-indigo-500/30">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-white text-sm">
              {editingReport ? 'Edit Draft Report' : 'New Daily Report'}
            </h3>
            <button onClick={cancelForm} className="text-slate-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Hours + Tasks row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="label">Hours Worked *</label>
              <input type="number" min="0" max="24" step="0.5"
                value={form.hours_worked} onChange={f('hours_worked')}
                placeholder="e.g. 8" className="input w-full" disabled={isBusy} />
            </div>
            <div>
              <label className="label">Tasks Assigned *</label>
              <input type="text" value={form.tasks_assigned} onChange={f('tasks_assigned')}
                placeholder="e.g. 5 tasks" className="input w-full" disabled={isBusy} />
            </div>
            <div>
              <label className="label">Tasks Completed *</label>
              <input type="text" value={form.tasks_completed} onChange={f('tasks_completed')}
                placeholder="e.g. 3 tasks" className="input w-full" disabled={isBusy} />
            </div>
            <div>
              <label className="label">Tasks Pending</label>
              <input type="text" value={form.tasks_pending} onChange={f('tasks_pending')}
                placeholder="e.g. 2 tasks" className="input w-full" disabled={isBusy} />
            </div>
          </div>

          {/* Work Description */}
          <div>
            <label className="label">Work Description *</label>
            <textarea value={form.work_description} onChange={f('work_description')}
              placeholder="Describe what you worked on..." rows={4}
              className="input w-full resize-none" disabled={isBusy} />
          </div>

          {/* Blockers */}
          <div>
            <label className="label">Blockers / Issues <span className="text-slate-500">(optional)</span></label>
            <textarea value={form.blockers} onChange={f('blockers')}
              placeholder="Any blockers or issues..." rows={3}
              className="input w-full resize-none" disabled={isBusy} />
          </div>

          {/* Attachments */}
          <div className="space-y-3">
            <label className="label">Attachments <span className="text-slate-500">(optional)</span></label>

            {/* Saved attachments (when editing) */}
            {editingReport?.attachments?.length > 0 && (
              <div className="space-y-1.5">
                {editingReport.attachments.map(att => (
                  <div key={att.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-700/40 border border-slate-600/50">
                    <a href={att.url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 truncate">
                      <Paperclip className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{att.filename || 'Attachment'}</span>
                    </a>
                    <button type="button" onClick={() => handleDeleteAttachment(att.id)}
                      disabled={isBusy} className="ml-2 text-slate-500 hover:text-red-400 flex-shrink-0 disabled:opacity-40">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Staged new files */}
            {newFiles.length > 0 && (
              <div className="space-y-1.5">
                {newFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30">
                    <span className="flex items-center gap-2 text-sm text-slate-300 truncate">
                      <Image className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                      <span className="truncate">{f.name}</span>
                    </span>
                    <button type="button" onClick={() => removeNewFile(i)}
                      disabled={isBusy} className="ml-2 text-slate-500 hover:text-red-400 flex-shrink-0 disabled:opacity-40">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload trigger */}
            <label className={clsx(
              'flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors',
              newFiles.length > 0
                ? 'border-indigo-500/50 bg-indigo-500/10'
                : 'border-slate-600 hover:border-slate-500 bg-slate-700/30',
              isBusy && 'opacity-50 cursor-not-allowed'
            )}>
              <Upload className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span className="text-sm text-slate-400">
                {newFiles.length > 0 ? `${newFiles.length} file(s) selected — click to add more` : 'Click to upload files (images, PDF, doc)'}
              </span>
              <input type="file" multiple className="hidden" accept="image/*,.pdf,.doc,.docx"
                onChange={(e) => setNewFiles(prev => [...prev, ...Array.from(e.target.files)])}
                disabled={isBusy} />
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2 border-t border-slate-700/50">
            <button onClick={() => submitMutation.mutate()}
              disabled={isBusy || !form.work_description || !form.hours_worked || !form.tasks_assigned || !form.tasks_completed}
              className="btn-primary flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              {submitMutation.isPending ? 'Submitting…' : 'Submit Report'}
            </button>
            <button onClick={() => saveMutation.mutate()}
              disabled={isBusy || !form.work_description || !form.hours_worked}
              className="btn-secondary flex items-center gap-2 text-xs">
              <Clock className="w-4 h-4" />
              {saveMutation.isPending ? 'Saving…' : 'Save as Draft'}
            </button>
            <button onClick={cancelForm} disabled={isBusy}
              className="btn-secondary flex items-center gap-2 text-xs ml-auto">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Today's submitted reports list */}
      {reports.length === 0 && !showForm ? (
        <div className="card p-8 text-center text-slate-500">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No reports submitted today</p>
          <p className="text-xs mt-1">Click "New Report" to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <div key={report.id} className="card">
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-700/20 transition-colors"
                onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex-shrink-0">
                    <span className={clsx('px-2.5 py-1 rounded-full text-xs font-medium capitalize', STATUS_BADGE[report.status])}>
                      {report.status}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{report.work_description?.slice(0, 80)}{report.work_description?.length > 80 ? '…' : ''}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {report.hours_worked}h · {report.tasks_completed} tasks done
                      {report.created_at && ` · ${new Date(report.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  {report.status === 'pending' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditReport(report) }}
                      className="px-2.5 py-1 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 rounded-lg text-xs font-medium transition-colors"
                    >
                      Edit
                    </button>
                  )}
                  {expandedId === report.id
                    ? <ChevronUp className="w-4 h-4 text-slate-400" />
                    : <ChevronDown className="w-4 h-4 text-slate-400" />
                  }
                </div>
              </div>

              {expandedId === report.id && (
                <div className="px-5 pb-4 pt-1 space-y-3 border-t border-slate-700/30">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <SummaryItem label="Hours Worked" value={`${report.hours_worked}h`} />
                    <SummaryItem label="Tasks Assigned" value={report.tasks_assigned} />
                    <SummaryItem label="Tasks Completed" value={report.tasks_completed} />
                  </div>
                  <SummaryItem label="Work Description" value={report.work_description} />
                  {report.tasks_pending && <SummaryItem label="Pending Tasks" value={report.tasks_pending} />}
                  {report.blockers && <SummaryItem label="Blockers / Issues" value={report.blockers} />}
                  {report.attachments?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-slate-500 mb-1">Attachments</p>
                      {report.attachments.map(att => (
                        <a key={att.id} href={att.url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 block">
                          <Paperclip className="w-4 h-4" /> {att.filename || 'Attachment'}
                        </a>
                      ))}
                    </div>
                  )}
                  {report.status === 'reviewed' && report.review_note && (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                      <p className="text-xs text-green-400 font-medium mb-1">Reviewer's Note</p>
                      <p className="text-sm text-slate-300">{report.review_note}</p>
                      {report.reviewed_by_name && (
                        <p className="text-xs text-slate-500 mt-1">— {report.reviewed_by_name}</p>
                      )}
                    </div>
                  )}
                  {report.status === 'submitted' && (
                    <p className="text-xs text-slate-500 flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                      Submitted — awaiting review
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryItem({ label, value }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-sm text-slate-200 whitespace-pre-wrap">{value}</p>
    </div>
  )
}
