/**
 * ActivityLogsPage — paginated activity log table.
 * Managers+ see all; employees see only their own.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity, Search, Filter, ChevronLeft, ChevronRight,
  LogIn, LogOut, CheckSquare, UserPlus, MessageSquare,
  FileText, Globe, Download, Timer,
} from 'lucide-react'
import { trackingService } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { timeAgo, formatDate, verbToLabel, initials } from '../utils/helpers'

const VERB_ICONS = {
  logged_in:              <LogIn    className="w-3.5 h-3.5" />,
  logged_out:             <LogOut   className="w-3.5 h-3.5" />,
  task_created:           <CheckSquare className="w-3.5 h-3.5" />,
  task_started:           <CheckSquare className="w-3.5 h-3.5" />,
  task_completed:         <CheckSquare className="w-3.5 h-3.5" />,
  task_updated:           <CheckSquare className="w-3.5 h-3.5" />,
  employee_added:         <UserPlus className="w-3.5 h-3.5" />,
  comment_added:          <MessageSquare className="w-3.5 h-3.5" />,
  daily_report_submitted: <FileText className="w-3.5 h-3.5" />,
  page_visited:           <Globe    className="w-3.5 h-3.5" />,
  document_downloaded:    <Download className="w-3.5 h-3.5" />,
  timer_started:          <Timer    className="w-3.5 h-3.5" />,
  timer_stopped:          <Timer    className="w-3.5 h-3.5" />,
}

const VERB_COLORS = {
  logged_in:              'bg-green-500/10 text-green-400',
  logged_out:             'bg-slate-500/10 text-slate-400',
  task_completed:         'bg-emerald-500/10 text-emerald-400',
  task_created:           'bg-blue-500/10 text-blue-400',
  task_started:           'bg-indigo-500/10 text-indigo-400',
  task_updated:           'bg-cyan-500/10 text-cyan-400',
  employee_added:         'bg-violet-500/10 text-violet-400',
  comment_added:          'bg-yellow-500/10 text-yellow-400',
  daily_report_submitted: 'bg-orange-500/10 text-orange-400',
  page_visited:           'bg-slate-500/10 text-slate-400',
  timer_started:          'bg-pink-500/10 text-pink-400',
  timer_stopped:          'bg-pink-500/10 text-pink-400',
}

const ALL_VERBS = [
  'logged_in', 'logged_out',
  'task_created', 'task_started', 'task_updated', 'task_completed', 'task_assigned',
  'employee_added', 'employee_updated', 'comment_added',
  'daily_report_submitted', 'page_visited', 'document_downloaded',
  'timer_started', 'timer_stopped',
  'salary_structure_created', 'salary_updated', 'payslip_generated',
]

export default function ActivityLogsPage() {
  const { user } = useAuthStore()
  const isManager = ['founder', 'admin', 'manager', 'hr'].includes(user?.role)

  const [search, setSearch]   = useState('')
  const [verbFilter, setVerb] = useState('')
  const [dateFrom, setFrom]   = useState('')
  const [dateTo, setTo]       = useState('')
  const [page, setPage]       = useState(1)

  const params = {
    page,
    ...(verbFilter && { verb: verbFilter }),
    ...(dateFrom   && { date_from: dateFrom }),
    ...(dateTo     && { date_to:   dateTo }),
  }

  const { data, isLoading } = useQuery({
    queryKey: ['activity-logs', params],
    queryFn:  () => trackingService.activityList(params).then(r => r.data),
    keepPreviousData: true,
  })

  const logs  = Array.isArray(data) ? data : data?.results ?? []
  const total = data?.count ?? logs.length
  const totalPages = Math.ceil(total / 20) || 1

  // Client-side search filter
  const filtered = search
    ? logs.filter(l =>
        l.description?.toLowerCase().includes(search.toLowerCase()) ||
        l.actor_name?.toLowerCase().includes(search.toLowerCase()) ||
        l.target_name?.toLowerCase().includes(search.toLowerCase())
      )
    : logs

  const resetFilters = () => {
    setVerb(''); setFrom(''); setTo(''); setSearch(''); setPage(1)
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
          <Activity className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Activity Logs</h1>
          <p className="text-slate-400 text-sm">
            {isManager ? 'Full audit trail of all system events' : 'Your personal activity history'}
          </p>
        </div>
        <div className="ml-auto text-slate-400 text-sm">{total.toLocaleString()} total events</div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48">
          <label className="label">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search descriptions…" className="input-field pl-9 w-full" />
          </div>
        </div>
        <div>
          <label className="label">Event Type</label>
          <select value={verbFilter} onChange={e => { setVerb(e.target.value); setPage(1) }} className="input-field w-48">
            <option value="">All Events</option>
            {ALL_VERBS.map(v => (
              <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input type="date" value={dateFrom} onChange={e => { setFrom(e.target.value); setPage(1) }} className="input-field" />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" value={dateTo} onChange={e => { setTo(e.target.value); setPage(1) }} className="input-field" />
        </div>
        <button onClick={resetFilters} className="btn-secondary text-sm">Clear</button>
      </div>

      {/* Log table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">
            <Activity className="w-6 h-6 mx-auto mb-2 animate-pulse" />
            Loading logs…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>No activity logs found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50">
                <tr className="text-left text-slate-400">
                  {isManager && <th className="px-4 py-3 font-medium">User</th>}
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Target</th>
                  <th className="px-4 py-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => {
                  const verbColor = VERB_COLORS[log.verb] || 'bg-slate-500/10 text-slate-400'
                  const verbIcon  = VERB_ICONS[log.verb]  || <Activity className="w-3.5 h-3.5" />
                  return (
                    <tr key={log.id} className="border-t border-slate-700/50 hover:bg-slate-700/20">
                      {isManager && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-indigo-600/50 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {initials(log.actor_name || '?')}
                            </div>
                            <div>
                              <p className="text-white text-xs font-medium">{log.actor_name || '—'}</p>
                              <p className="text-slate-500 text-xs">{log.actor_role || ''}</p>
                            </div>
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${verbColor}`}>
                          {verbIcon}
                          {log.verb.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300 max-w-xs truncate">{log.description}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {log.target_type && (
                          <span className="bg-slate-700 px-1.5 py-0.5 rounded mr-1">{log.target_type}</span>
                        )}
                        {log.target_name}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                        {timeAgo(log.created_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700">
            <p className="text-slate-400 text-sm">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="btn-secondary py-1 px-2 text-sm disabled:opacity-40">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="btn-secondary py-1 px-2 text-sm disabled:opacity-40">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
