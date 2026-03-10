import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dailyReportService } from '../../services/api'
import { formatDate } from '../../utils/helpers'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { FileText, Upload, CheckCircle, Clock, Eye, Paperclip } from 'lucide-react'

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
  const [form, setForm]         = useState(EMPTY_FORM)
  const [attachment, setAttachment] = useState(null)
  const [existingReport, setExistingReport] = useState(null)

  // Load today's existing report
  const { data, isLoading } = useQuery({
    queryKey: ['daily-report-today'],
    queryFn: () => dailyReportService.list({ date: today }).then(r => {
      const list = Array.isArray(r.data) ? r.data : r.data?.results ?? []
      return list[0] ?? null
    }),
  })

  useEffect(() => {
    if (data) {
      setExistingReport(data)
      setForm({
        report_date:      data.report_date,
        tasks_assigned:   data.tasks_assigned   || '',
        tasks_completed:  data.tasks_completed  || '',
        tasks_pending:    data.tasks_pending    || '',
        hours_worked:     data.hours_worked     || '',
        work_description: data.work_description || '',
        blockers:         data.blockers         || '',
      })
    }
  }, [data])

  const f = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }))

  const buildFormData = () => {
    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => { if (v !== '') fd.append(k, v) })
    if (attachment) fd.append('attachment', attachment)
    return fd
  }

  // Save Draft
  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = buildFormData()
      if (existingReport) return dailyReportService.update(existingReport.id, payload)
      return dailyReportService.create(payload)
    },
    onSuccess: (res) => {
      setExistingReport(res.data)
      qc.invalidateQueries({ queryKey: ['daily-report-today'] })
      qc.invalidateQueries({ queryKey: ['my-daily-reports'] })
      toast.success('Report saved as draft')
    },
    onError: (err) => {
      const msg = err.response?.data?.detail || err.response?.data?.report_date?.[0] || 'Failed to save'
      toast.error(msg)
    },
  })

  // Submit Report
  const submitMutation = useMutation({
    mutationFn: async () => {
      let report = existingReport
      // Save first if unsaved
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
    onSuccess: (res) => {
      setExistingReport(res.data)
      qc.invalidateQueries({ queryKey: ['daily-report-today'] })
      qc.invalidateQueries({ queryKey: ['my-daily-reports'] })
      toast.success('Daily report submitted successfully!')
    },
    onError: (err) => {
      const msg = err.response?.data?.detail || 'Submission failed'
      toast.error(msg)
    },
  })

  const isLocked = existingReport && existingReport.status !== 'pending'
  const isBusy   = saveMutation.isPending || submitMutation.isPending

  if (isLoading) {
    return (
      <div className="card p-6 flex items-center justify-center h-40">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Read-only view when submitted or reviewed
  if (isLocked) {
    return (
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Today's Report</h2>
              <p className="text-xs text-slate-400">{formatDate(existingReport.report_date)}</p>
            </div>
          </div>
          <span className={clsx('px-3 py-1 rounded-full text-xs font-medium capitalize', STATUS_BADGE[existingReport.status])}>
            {existingReport.status}
          </span>
        </div>

        {existingReport.status === 'reviewed' && existingReport.review_note && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
            <p className="text-xs text-green-400 font-medium mb-1">Reviewer's Note</p>
            <p className="text-sm text-slate-300">{existingReport.review_note}</p>
            <p className="text-xs text-slate-500 mt-1">
              Reviewed by {existingReport.reviewed_by_name} · {existingReport.reviewed_at ? formatDate(existingReport.reviewed_at) : ''}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <SummaryItem label="Hours Worked" value={`${existingReport.hours_worked}h`} />
          <SummaryItem label="Tasks Assigned" value={existingReport.tasks_assigned} />
          <SummaryItem label="Tasks Completed" value={existingReport.tasks_completed} />
        </div>
        <SummaryItem label="Work Description" value={existingReport.work_description} />
        {existingReport.tasks_pending && <SummaryItem label="Pending Tasks" value={existingReport.tasks_pending} />}
        {existingReport.blockers && <SummaryItem label="Blockers / Issues" value={existingReport.blockers} />}
        {existingReport.attachment_url && (
          <a href={existingReport.attachment_url} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300">
            <Paperclip className="w-4 h-4" /> View Attachment
          </a>
        )}

        <div className="pt-2 border-t border-slate-700/50">
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-green-400" />
            {existingReport.status === 'submitted' ? 'Submitted — awaiting review' : 'Reviewed by HR/Manager'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="card p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
          <FileText className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h2 className="font-semibold text-white">
            {existingReport ? 'Edit Today\'s Report' : 'Submit Daily Report'}
          </h2>
          <p className="text-xs text-slate-400">{formatDate(today)}</p>
        </div>
        {existingReport && (
          <span className={clsx('ml-auto px-3 py-1 rounded-full text-xs font-medium capitalize', STATUS_BADGE['pending'])}>
            Draft
          </span>
        )}
      </div>

      {/* Hours + Tasks row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="label">Hours Worked *</label>
          <input
            type="number" min="0" max="24" step="0.5"
            value={form.hours_worked} onChange={f('hours_worked')}
            placeholder="e.g. 8"
            className="input w-full" disabled={isBusy}
          />
        </div>
        <div>
          <label className="label">Tasks Assigned *</label>
          <input
            type="text" value={form.tasks_assigned} onChange={f('tasks_assigned')}
            placeholder="e.g. 5 tasks"
            className="input w-full" disabled={isBusy}
          />
        </div>
        <div>
          <label className="label">Tasks Completed *</label>
          <input
            type="text" value={form.tasks_completed} onChange={f('tasks_completed')}
            placeholder="e.g. 3 tasks"
            className="input w-full" disabled={isBusy}
          />
        </div>
        <div>
          <label className="label">Tasks Pending</label>
          <input
            type="text" value={form.tasks_pending} onChange={f('tasks_pending')}
            placeholder="e.g. 2 tasks"
            className="input w-full" disabled={isBusy}
          />
        </div>
      </div>

      {/* Work Description */}
      <div>
        <label className="label">Work Description *</label>
        <textarea
          value={form.work_description} onChange={f('work_description')}
          placeholder="Describe what you worked on today in detail..."
          rows={4} className="input w-full resize-none" disabled={isBusy}
        />
      </div>

      {/* Blockers */}
      <div>
        <label className="label">Blockers / Issues <span className="text-slate-500">(optional)</span></label>
        <textarea
          value={form.blockers} onChange={f('blockers')}
          placeholder="Any blockers, issues, or dependencies that slowed you down..."
          rows={3} className="input w-full resize-none" disabled={isBusy}
        />
      </div>

      {/* Attachment */}
      <div>
        <label className="label">Attachment <span className="text-slate-500">(optional)</span></label>
        <label className={clsx(
          'flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors',
          attachment
            ? 'border-indigo-500/50 bg-indigo-500/10'
            : 'border-slate-600 hover:border-slate-500 bg-slate-700/30',
          isBusy && 'opacity-50 cursor-not-allowed'
        )}>
          <Upload className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm text-slate-400 truncate">
            {attachment ? attachment.name : 'Click to upload a file (PDF, image, doc)'}
          </span>
          <input
            type="file" className="hidden"
            onChange={(e) => setAttachment(e.target.files[0] || null)}
            disabled={isBusy}
          />
        </label>
        {existingReport?.attachment_url && !attachment && (
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
            <Paperclip className="w-3 h-3" />
            Previously uploaded —
            <a href={existingReport.attachment_url} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
              View file
            </a>
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2 border-t border-slate-700/50">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={isBusy || !form.work_description || !form.hours_worked}
          className="btn-secondary flex items-center gap-2"
        >
          <Clock className="w-4 h-4" />
          {saveMutation.isPending ? 'Saving…' : 'Save Draft'}
        </button>
        <button
          onClick={() => submitMutation.mutate()}
          disabled={isBusy || !form.work_description || !form.hours_worked || !form.tasks_assigned || !form.tasks_completed}
          className="btn-primary flex items-center gap-2"
        >
          <CheckCircle className="w-4 h-4" />
          {submitMutation.isPending ? 'Submitting…' : 'Submit Report'}
        </button>
        <p className="text-xs text-slate-500 ml-auto hidden sm:block">
          * Required fields. Submitted reports cannot be edited.
        </p>
      </div>
    </div>
  )
}

function SummaryItem({ label, value }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-sm text-slate-200">{value}</p>
    </div>
  )
}
