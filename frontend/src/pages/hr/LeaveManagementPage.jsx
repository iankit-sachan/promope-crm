import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Calendar, Check, X, Clock, PlusCircle, AlertCircle, Wallet } from 'lucide-react'
import { hrService, employeeService } from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { formatDate } from '../../utils/helpers'
import clsx from 'clsx'
import toast from 'react-hot-toast'

const TABS = ['Pending', 'All Requests', 'My Leave', 'Balances']

const LEAVE_TYPE_LABELS = {
  sick: 'Sick', casual: 'Casual', paid: 'Paid', emergency: 'Emergency',
}

function LeaveTypeBadge({ type }) {
  const cls = {
    sick:      'leave-sick',
    casual:    'leave-casual',
    paid:      'leave-paid',
    emergency: 'leave-emergency',
  }[type] || 'badge bg-slate-500/10 text-slate-400'
  return <span className={cls}>{LEAVE_TYPE_LABELS[type] || type}</span>
}

function StatusBadge({ status }) {
  const cls = `status-${status}`
  return <span className={cls}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
}

// ── Reject modal ──────────────────────────────────────────────────────────────
function RejectModal({ leave, onClose, onConfirm, loading }) {
  const [comment, setComment] = useState('')
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md fade-in">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h3 className="font-semibold text-red-400">Reject Leave Request</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-400">
            Rejecting <strong className="text-slate-200">{leave?.employee_name}</strong>'s{' '}
            {LEAVE_TYPE_LABELS[leave?.leave_type]} leave ({leave?.num_days} days).
            A reason is required.
          </p>
          <textarea
            className="input w-full min-h-[80px] resize-none"
            placeholder="Rejection reason (required)"
            value={comment}
            onChange={e => setComment(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-slate-700">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button
            onClick={() => onConfirm(comment)}
            disabled={!comment.trim() || loading}
            className="btn-danger disabled:opacity-50"
          >
            {loading ? 'Rejecting...' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Leave submit form ─────────────────────────────────────────────────────────
function LeaveSubmitForm({ onSuccess }) {
  const { user } = useAuthStore()
  const isHR = ['founder', 'admin', 'hr'].includes(user?.role)

  const [form, setForm] = useState({
    leave_type: 'sick', start_date: '', end_date: '', reason: '',
    employee_id: '',
  })
  const qc = useQueryClient()

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-minimal'],
    queryFn: () => employeeService.list().then(r => Array.isArray(r.data) ? r.data : r.data?.results ?? []),
    enabled: isHR,
  })

  const mutation = useMutation({
    mutationFn: (data) => hrService.leaveCreate(data),
    onSuccess: () => {
      toast.success('Leave request submitted')
      setForm({ leave_type: 'sick', start_date: '', end_date: '', reason: '', employee_id: '' })
      qc.invalidateQueries({ queryKey: ['leave-list'] })
      qc.invalidateQueries({ queryKey: ['leave-balances'] })
      onSuccess?.()
    },
    onError: (e) => toast.error(e?.response?.data?.non_field_errors?.[0] || e?.response?.data?.employee_id?.[0] || 'Failed to submit leave'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.start_date || !form.end_date || !form.reason.trim()) {
      toast.error('Fill in all fields')
      return
    }
    if (isHR && !form.employee_id) {
      toast.error('Please select an employee')
      return
    }
    const payload = { leave_type: form.leave_type, start_date: form.start_date, end_date: form.end_date, reason: form.reason }
    if (isHR && form.employee_id) payload.employee_id = form.employee_id
    mutation.mutate(payload)
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-lg space-y-4">
      <h3 className="font-semibold text-slate-200">New Leave Request</h3>
      {isHR && (
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Employee *</label>
          <select
            className="input w-full"
            value={form.employee_id}
            onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}
          >
            <option value="">Select employee</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.full_name} ({emp.employee_id})</option>
            ))}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Leave Type</label>
          <select
            className="input w-full"
            value={form.leave_type}
            onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))}
          >
            <option value="sick">Sick Leave</option>
            <option value="casual">Casual Leave</option>
            <option value="paid">Paid Leave</option>
            <option value="emergency">Emergency Leave</option>
          </select>
        </div>
        <div /> {/* spacer */}
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Start Date</label>
          <input
            type="date"
            className="input w-full"
            value={form.start_date}
            onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">End Date</label>
          <input
            type="date"
            className="input w-full"
            value={form.end_date}
            min={form.start_date}
            onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-slate-400 mb-1 block">Reason</label>
        <textarea
          className="input w-full min-h-[80px] resize-none"
          placeholder="Briefly describe the reason..."
          value={form.reason}
          onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
        />
      </div>
      <button type="submit" disabled={mutation.isPending} className="btn-primary">
        {mutation.isPending ? 'Submitting...' : 'Submit Leave Request'}
      </button>
    </form>
  )
}

// ── Balance cards ─────────────────────────────────────────────────────────────
function BalanceCard({ balance }) {
  const pct = balance.total_days > 0
    ? Math.round(balance.used_days / balance.total_days * 100)
    : 0
  const COLORS_MAP = {
    sick: 'bg-red-500', casual: 'bg-blue-500',
    paid: 'bg-green-500', emergency: 'bg-orange-500',
  }
  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between">
        <LeaveTypeBadge type={balance.leave_type} />
        <span className="text-xs text-slate-500">{balance.year}</span>
      </div>
      <div className="flex items-end gap-1">
        <span className="text-3xl font-bold text-white">{balance.remaining_days}</span>
        <span className="text-slate-400 text-sm mb-1">/ {balance.total_days} remaining</span>
      </div>
      <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all', COLORS_MAP[balance.leave_type] || 'bg-indigo-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-slate-500">{balance.used_days} days used</p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LeaveManagementPage() {
  const [activeTab, setActiveTab] = useState(0)
  const [filters, setFilters] = useState({ status: '', leave_type: '', employee: '' })
  const [rejectTarget, setRejectTarget] = useState(null)
  const [balanceEmployee, setBalanceEmployee] = useState('')
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const isHR = ['founder', 'admin', 'hr'].includes(user?.role)

  // Pending leaves
  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['leave-list', 'pending'],
    queryFn: () => hrService.leaveList({ status: 'pending' }).then(r => r.data),
    enabled: isHR,
  })

  // All leaves
  const { data: allData, isLoading: allLoading } = useQuery({
    queryKey: ['leave-list', 'all', filters],
    queryFn: () => hrService.leaveList({
      ...(filters.status && { status: filters.status }),
      ...(filters.leave_type && { leave_type: filters.leave_type }),
      ...(filters.employee && { employee: filters.employee }),
    }).then(r => r.data),
    enabled: activeTab === 1,
  })

  // My leaves
  const { data: myData, isLoading: myLoading } = useQuery({
    queryKey: ['leave-list', 'mine'],
    queryFn: () => hrService.leaveList({}).then(r => r.data),
    enabled: activeTab === 2,
  })

  // Leave balances
  const { data: balances, isLoading: balancesLoading } = useQuery({
    queryKey: ['leave-balances', balanceEmployee],
    queryFn: () => hrService.leaveBalances(
      balanceEmployee ? { employee: balanceEmployee } : {}
    ).then(r => r.data),
    enabled: activeTab === 3,
  })

  // Employees list for balance filter
  const { data: empData } = useQuery({
    queryKey: ['employees-minimal'],
    queryFn: () => employeeService.list({ page_size: 200 }).then(r => r.data),
    enabled: isHR && activeTab === 3,
  })
  const employees = empData?.results || empData || []

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: ({ id }) => hrService.leaveApprove(id, {}),
    onSuccess: () => {
      toast.success('Leave approved')
      qc.invalidateQueries({ queryKey: ['leave-list'] })
      qc.invalidateQueries({ queryKey: ['hr-dashboard'] })
    },
    onError: () => toast.error('Failed to approve leave'),
  })

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: ({ id, comment }) => hrService.leaveReject(id, { comment }),
    onSuccess: () => {
      toast.success('Leave rejected')
      setRejectTarget(null)
      qc.invalidateQueries({ queryKey: ['leave-list'] })
    },
    onError: () => toast.error('Failed to reject leave'),
  })

  const pendingLeaves  = pendingData?.results || pendingData || []
  const allLeaves      = allData?.results    || allData    || []
  const myLeaves       = myData?.results     || myData     || []

  const LeaveRow = ({ leave, showActions }) => (
    <tr className="table-row">
      <td className="px-4 py-3 text-sm text-slate-200 font-medium">{leave.employee_name}</td>
      <td className="px-4 py-3"><LeaveTypeBadge type={leave.leave_type} /></td>
      <td className="px-4 py-3 text-sm text-slate-300">{formatDate(leave.start_date)}</td>
      <td className="px-4 py-3 text-sm text-slate-300">{formatDate(leave.end_date)}</td>
      <td className="px-4 py-3 text-sm text-slate-400 text-center">{leave.num_days}</td>
      <td className="px-4 py-3 text-xs text-slate-400 max-w-[160px] truncate">{leave.reason}</td>
      <td className="px-4 py-3"><StatusBadge status={leave.status} /></td>
      {showActions && (
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => approveMutation.mutate({ id: leave.id })}
              disabled={approveMutation.isPending}
              className="px-2 py-1 text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20 rounded-lg hover:bg-green-500/20"
            >
              <Check className="w-3 h-3" />
            </button>
            <button
              onClick={() => setRejectTarget(leave)}
              className="px-2 py-1 text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </td>
      )}
    </tr>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Leave Management</h1>
        <p className="text-slate-400 text-sm mt-1">Manage employee leave requests and balances</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/50 p-1 rounded-xl w-fit border border-slate-700">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              activeTab === i
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            {tab}
            {i === 0 && pendingLeaves.length > 0 && (
              <span className="ml-2 w-5 h-5 bg-orange-500 rounded-full text-white text-xs inline-flex items-center justify-center">
                {pendingLeaves.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Pending */}
      {activeTab === 0 && (
        <div className="card overflow-hidden p-0">
          {pendingLoading ? (
            <div className="p-8 text-center text-slate-500">Loading...</div>
          ) : pendingLeaves.length === 0 ? (
            <div className="p-8 text-center">
              <Check className="w-10 h-10 text-green-400 mx-auto mb-2" />
              <p className="text-slate-400">No pending leave requests</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-700">
                  <tr>
                    {['Employee','Type','From','To','Days','Reason','Status','Actions'].map(h => (
                      <th key={h} className="th text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {pendingLeaves.map(l => <LeaveRow key={l.id} leave={l} showActions />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: All Requests */}
      {activeTab === 1 && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <select
              className="input text-sm"
              value={filters.status}
              onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select
              className="input text-sm"
              value={filters.leave_type}
              onChange={e => setFilters(f => ({ ...f, leave_type: e.target.value }))}
            >
              <option value="">All Types</option>
              <option value="sick">Sick</option>
              <option value="casual">Casual</option>
              <option value="paid">Paid</option>
              <option value="emergency">Emergency</option>
            </select>
          </div>
          <div className="card overflow-hidden p-0">
            {allLoading ? (
              <div className="p-8 text-center text-slate-500">Loading...</div>
            ) : allLeaves.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No leave requests found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-slate-700">
                    <tr>
                      {['Employee','Type','From','To','Days','Reason','Status'].map(h => (
                        <th key={h} className="th text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {allLeaves.map(l => <LeaveRow key={l.id} leave={l} showActions={false} />)}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: My Leave */}
      {activeTab === 2 && (
        <div className="space-y-6">
          <LeaveSubmitForm />
          <div className="card overflow-hidden p-0">
            <div className="px-4 py-3 border-b border-slate-700">
              <h3 className="font-medium text-sm text-slate-200">My Leave History</h3>
            </div>
            {myLoading ? (
              <div className="p-6 text-center text-slate-500">Loading...</div>
            ) : myLeaves.length === 0 ? (
              <div className="p-6 text-center text-slate-500">No leave requests yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-slate-700">
                    <tr>
                      {['Type','From','To','Days','Reason','Status'].map(h => (
                        <th key={h} className="th text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {myLeaves.map(l => (
                      <tr key={l.id} className="table-row">
                        <td className="px-4 py-3"><LeaveTypeBadge type={l.leave_type} /></td>
                        <td className="px-4 py-3 text-sm text-slate-300">{formatDate(l.start_date)}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{formatDate(l.end_date)}</td>
                        <td className="px-4 py-3 text-sm text-slate-400 text-center">{l.num_days}</td>
                        <td className="px-4 py-3 text-xs text-slate-400 max-w-[180px] truncate">{l.reason}</td>
                        <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Balances */}
      {activeTab === 3 && (
        <div className="space-y-4">
          {isHR && (
            <div className="flex items-center gap-3">
              <Wallet className="w-4 h-4 text-slate-400" />
              <select
                className="input text-sm"
                value={balanceEmployee}
                onChange={e => setBalanceEmployee(e.target.value)}
              >
                <option value="">My Balances</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.full_name} ({e.employee_id})</option>
                ))}
              </select>
            </div>
          )}
          {balancesLoading ? (
            <div className="text-center py-8 text-slate-500">Loading...</div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {(balances || []).map(b => <BalanceCard key={b.id} balance={b} />)}
              {balances?.length === 0 && (
                <p className="col-span-4 text-center text-slate-500 py-8">No balance data</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Reject modal */}
      {rejectTarget && (
        <RejectModal
          leave={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onConfirm={(comment) => rejectMutation.mutate({ id: rejectTarget.id, comment })}
          loading={rejectMutation.isPending}
        />
      )}
    </div>
  )
}
