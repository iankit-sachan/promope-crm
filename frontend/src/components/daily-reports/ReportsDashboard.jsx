import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dailyReportService } from '../../services/api'
import { employeeService, departmentService } from '../../services/api'
import { formatDate } from '../../utils/helpers'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import {
  CheckCircle, Clock, Users, AlertCircle, ChevronDown, ChevronUp,
  Paperclip, Eye, Star, BarChart2,
} from 'lucide-react'

const STATUS_BADGE = {
  pending:   'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  submitted: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  reviewed:  'bg-green-500/20 text-green-400 border border-green-500/30',
}

const today = new Date().toISOString().split('T')[0]

export default function ReportsDashboard() {
  const qc = useQueryClient()
  const [filters, setFilters] = useState({ status: '', date: today, employee: '', department: '' })
  const [reviewModal, setReviewModal] = useState(null) // { report, note }
  const [expanded, setExpanded]   = useState(null)
  const [showNotSubmitted, setShowNotSubmitted] = useState(false)

  const f = (key) => (e) => setFilters(p => ({ ...p, [key]: e.target.value }))

  // Analytics
  const { data: analytics } = useQuery({
    queryKey: ['daily-report-analytics'],
    queryFn: () => dailyReportService.analytics().then(r => r.data),
    refetchInterval: 30000,
  })

  // All reports with filters
  const { data: reportsData, isLoading } = useQuery({
    queryKey: ['all-daily-reports', filters],
    queryFn: () => {
      const params = {}
      if (filters.status)     params.status     = filters.status
      if (filters.date)       params.date        = filters.date
      if (filters.employee)   params.employee    = filters.employee
      if (filters.department) params.department  = filters.department
      return dailyReportService.all(params).then(r =>
        Array.isArray(r.data) ? r.data : r.data?.results ?? []
      )
    },
    refetchInterval: 30000,
  })

  const reports = reportsData || []

  // Employees + Departments for filter dropdowns
  const { data: employees } = useQuery({
    queryKey: ['employees-list-minimal'],
    queryFn: () => employeeService.list().then(r =>
      Array.isArray(r.data) ? r.data : r.data?.results ?? []
    ),
  })
  const { data: departments } = useQuery({
    queryKey: ['departments-list'],
    queryFn: () => departmentService.list().then(r =>
      Array.isArray(r.data) ? r.data : r.data?.results ?? []
    ),
  })

  // Review mutation
  const reviewMutation = useMutation({
    mutationFn: ({ id, note }) => dailyReportService.review(id, { review_note: note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-daily-reports'] })
      qc.invalidateQueries({ queryKey: ['daily-report-analytics'] })
      setReviewModal(null)
      toast.success('Report marked as reviewed')
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Review failed'),
  })

  const statCards = [
    { label: 'Submitted Today',  value: analytics?.submitted_today     ?? '—', icon: CheckCircle, color: 'text-green-400',  bg: 'bg-green-500/10'  },
    { label: 'Pending Review',   value: analytics?.pending_today        ?? '—', icon: Clock,       color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    { label: 'Not Submitted',    value: analytics?.not_submitted_today  ?? '—', icon: AlertCircle, color: 'text-red-400',    bg: 'bg-red-500/10'    },
    { label: 'Total Hours Today',value: analytics?.total_hours_today != null ? `${analytics.total_hours_today}h` : '—',
      icon: BarChart2, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
  ]

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Daily Reports Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Review and manage employee daily work reports</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card p-4 flex items-center gap-4">
            <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', bg)}>
              <Icon className={clsx('w-5 h-5', color)} />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{value}</p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Not Submitted Employees (collapsible) */}
      {analytics?.not_submitted_employees?.length > 0 && (
        <div className="card">
          <button
            onClick={() => setShowNotSubmitted(!showNotSubmitted)}
            className="w-full flex items-center justify-between px-6 py-4 text-left"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-orange-400" />
              <span className="font-medium text-white text-sm">
                Employees Who Haven't Submitted Today
              </span>
              <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">
                {analytics.not_submitted_employees.length}
              </span>
            </div>
            {showNotSubmitted ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          {showNotSubmitted && (
            <div className="px-6 pb-4 flex flex-wrap gap-2">
              {analytics.not_submitted_employees.map((emp) => (
                <span key={emp.id} className="inline-flex items-center gap-1.5 bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-slate-300">
                  <Users className="w-3 h-3 text-slate-400" />
                  {emp.full_name}
                  {emp.department__name && (
                    <span className="text-slate-500">· {emp.department__name}</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Date</label>
            <input type="date" value={filters.date} onChange={f('date')} className="input w-full" />
          </div>
          <div>
            <label className="label">Status</label>
            <select value={filters.status} onChange={f('status')} className="input w-full">
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="submitted">Submitted</option>
              <option value="reviewed">Reviewed</option>
            </select>
          </div>
          <div>
            <label className="label">Department</label>
            <select value={filters.department} onChange={f('department')} className="input w-full">
              <option value="">All Departments</option>
              {(departments || []).map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Employee</label>
            <select value={filters.employee} onChange={f('employee')} className="input w-full">
              <option value="">All Employees</option>
              {(employees || []).map(e => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Reports Table */}
      <div className="card">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <h3 className="font-semibold text-white text-sm">
            Reports
            <span className="text-slate-500 font-normal ml-2">({reports.length})</span>
          </h3>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No reports match your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800/50">
                <tr className="text-left text-slate-400 text-xs">
                  <th className="th">Employee</th>
                  <th className="th">Department</th>
                  <th className="th">Date</th>
                  <th className="th">Hours</th>
                  <th className="th">Tasks Done</th>
                  <th className="th">Status</th>
                  <th className="th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <>
                    <tr
                      key={report.id}
                      className="border-t border-slate-700/50 hover:bg-slate-700/20"
                    >
                      <td className="td">
                        <div>
                          <p className="font-medium text-white text-sm">{report.employee_name}</p>
                          <p className="text-xs text-slate-500">{report.employee_id_code}</p>
                        </div>
                      </td>
                      <td className="td text-slate-400 text-sm">{report.department_name || '—'}</td>
                      <td className="td text-sm">{formatDate(report.report_date)}</td>
                      <td className="td">
                        <span className="font-semibold text-white">{report.hours_worked}h</span>
                      </td>
                      <td className="td text-sm text-green-400">{report.tasks_completed}</td>
                      <td className="td">
                        <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium capitalize', STATUS_BADGE[report.status])}>
                          {report.status}
                        </span>
                      </td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setExpanded(expanded === report.id ? null : report.id)}
                            className="p-1.5 hover:bg-slate-600 rounded-lg text-slate-400 hover:text-white transition-colors"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {report.status === 'submitted' && (
                            <button
                              onClick={() => setReviewModal({ report, note: '' })}
                              className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-xs font-medium transition-colors"
                            >
                              <Star className="w-3 h-3" /> Review
                            </button>
                          )}
                          {report.attachment_url && (
                            <a href={report.attachment_url} target="_blank" rel="noreferrer"
                              className="p-1.5 hover:bg-slate-600 rounded-lg text-indigo-400 transition-colors" title="View Attachment">
                              <Paperclip className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expanded === report.id && (
                      <tr key={`${report.id}-exp`} className="border-t border-slate-700/30 bg-slate-800/30">
                        <td colSpan={7} className="px-6 py-4 space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DetailBlock label="Tasks Assigned"   text={report.tasks_assigned} />
                            <DetailBlock label="Tasks Completed"  text={report.tasks_completed} />
                            {report.tasks_pending && <DetailBlock label="Tasks Pending" text={report.tasks_pending} />}
                          </div>
                          <DetailBlock label="Work Description" text={report.work_description} />
                          {report.blockers && <DetailBlock label="Blockers / Issues" text={report.blockers} />}
                          {report.status === 'reviewed' && report.review_note && (
                            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                              <p className="text-xs text-green-400 font-medium mb-1">Review Note</p>
                              <p className="text-sm text-slate-300">{report.review_note}</p>
                              {report.reviewed_by_name && (
                                <p className="text-xs text-slate-500 mt-1">
                                  Reviewed by {report.reviewed_by_name} · {report.reviewed_at ? formatDate(report.reviewed_at) : ''}
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review Modal */}
      {reviewModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-6 space-y-4 fade-in">
            <h3 className="font-semibold text-white text-lg">Mark Report as Reviewed</h3>
            <div className="space-y-1">
              <p className="text-sm text-slate-300">
                <span className="text-slate-500">Employee:</span> {reviewModal.report.employee_name}
              </p>
              <p className="text-sm text-slate-300">
                <span className="text-slate-500">Date:</span> {formatDate(reviewModal.report.report_date)}
              </p>
              <p className="text-sm text-slate-300">
                <span className="text-slate-500">Hours:</span> {reviewModal.report.hours_worked}h
              </p>
            </div>
            <div>
              <label className="label">Review Note <span className="text-slate-500">(optional)</span></label>
              <textarea
                value={reviewModal.note}
                onChange={(e) => setReviewModal(p => ({ ...p, note: e.target.value }))}
                placeholder="Add feedback or comments for the employee..."
                rows={3}
                className="input w-full resize-none"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setReviewModal(null)}
                className="btn-secondary flex-1"
                disabled={reviewMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={() => reviewMutation.mutate({ id: reviewModal.report.id, note: reviewModal.note })}
                disabled={reviewMutation.isPending}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                <Star className="w-4 h-4" />
                {reviewMutation.isPending ? 'Saving…' : 'Confirm Review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DetailBlock({ label, text }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-sm text-slate-300 whitespace-pre-wrap">{text}</p>
    </div>
  )
}
