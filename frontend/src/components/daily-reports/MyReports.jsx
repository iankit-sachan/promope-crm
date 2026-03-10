import { Fragment, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dailyReportService } from '../../services/api'
import { formatDate } from '../../utils/helpers'
import clsx from 'clsx'
import { ChevronDown, ChevronUp, Paperclip, History } from 'lucide-react'

const STATUS_BADGE = {
  pending:   'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  submitted: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  reviewed:  'bg-green-500/20 text-green-400 border border-green-500/30',
}

export default function MyReports() {
  const [statusFilter, setStatusFilter] = useState('')
  const [expanded, setExpanded] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['my-daily-reports', statusFilter],
    queryFn: () => dailyReportService.myReports(statusFilter ? { status: statusFilter } : {})
      .then(r => Array.isArray(r.data) ? r.data : r.data?.results ?? []),
  })

  const reports = data || []

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-slate-400" />
          <h3 className="font-semibold text-white text-sm">My Report History</h3>
          <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded-full">
            {reports.length}
          </span>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input text-xs py-1.5 w-36"
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="submitted">Submitted</option>
          <option value="reviewed">Reviewed</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No reports found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr className="text-left text-slate-400 text-xs">
                <th className="th">Date</th>
                <th className="th">Hours</th>
                <th className="th">Tasks Done</th>
                <th className="th">Tasks Pending</th>
                <th className="th">Status</th>
                <th className="th">Attachment</th>
                <th className="th">Details</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <Fragment key={report.id}>
                  <tr
                    className="border-t border-slate-700/50 hover:bg-slate-700/20 cursor-pointer"
                    onClick={() => setExpanded(expanded === report.id ? null : report.id)}
                  >
                    <td className="td font-medium text-white">{formatDate(report.report_date)}</td>
                    <td className="td">{report.hours_worked}h</td>
                    <td className="td text-green-400">{report.tasks_completed}</td>
                    <td className="td text-yellow-400">{report.tasks_pending || '—'}</td>
                    <td className="td">
                      <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium capitalize', STATUS_BADGE[report.status])}>
                        {report.status}
                      </span>
                    </td>
                    <td className="td">
                      {report.attachment_url
                        ? <a href={report.attachment_url} target="_blank" rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-indigo-400 hover:text-indigo-300">
                            <Paperclip className="w-4 h-4" />
                          </a>
                        : <span className="text-slate-600">—</span>
                      }
                    </td>
                    <td className="td">
                      {expanded === report.id
                        ? <ChevronUp className="w-4 h-4 text-slate-400" />
                        : <ChevronDown className="w-4 h-4 text-slate-400" />
                      }
                    </td>
                  </tr>
                  {expanded === report.id && (
                    <tr className="border-t border-slate-700/30 bg-slate-800/30">
                      <td colSpan={7} className="px-6 py-4 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <DetailBlock label="Tasks Assigned" text={report.tasks_assigned} />
                          <DetailBlock label="Tasks Completed" text={report.tasks_completed} />
                        </div>
                        <DetailBlock label="Work Description" text={report.work_description} />
                        {report.blockers && <DetailBlock label="Blockers / Issues" text={report.blockers} />}
                        {report.status === 'reviewed' && report.review_note && (
                          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                            <p className="text-xs text-green-400 font-medium mb-1">Reviewer Note</p>
                            <p className="text-sm text-slate-300">{report.review_note}</p>
                            {report.reviewed_by_name && (
                              <p className="text-xs text-slate-500 mt-1">— {report.reviewed_by_name}</p>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
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
