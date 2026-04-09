import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CreditCard, Search, Plus, Edit2, X, ChevronDown, Download,
  Eye, EyeOff, Shield, CheckCircle, XCircle, Clock, History,
  ThumbsUp, ThumbsDown, FileText,
} from 'lucide-react'
import { payrollService, departmentService } from '../../services/api'
import { initials, formatDate, timeAgo } from '../../utils/helpers'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const STATUS_STYLES = {
  pending:  { label: 'Pending',  cls: 'bg-yellow-500/10 text-yellow-400', icon: Clock },
  approved: { label: 'Approved', cls: 'bg-green-500/10 text-green-400',   icon: CheckCircle },
  rejected: { label: 'Rejected', cls: 'bg-red-500/10 text-red-400',       icon: XCircle },
}

// ── Bank Details Modal (Add / Edit) ─────────────────────────────────────────
function BankDetailsModal({ onClose, onSave, initial = null, employees = [] }) {
  const isEdit = !!initial
  const [form, setForm] = useState({
    employee:             initial?.employee ?? '',
    account_holder_name:  initial?.account_holder_name ?? '',
    bank_name:            initial?.bank_name ?? '',
    account_number:       '',
    ifsc_code:            initial?.ifsc_code ?? '',
    branch_name:          initial?.branch_name ?? '',
    upi_id:               initial?.upi_id ?? '',
    pan_number:           '',
  })
  const [showAcct, setShowAcct] = useState(false)
  const [showPan,  setShowPan]  = useState(false)

  const field = (label, key, opts = {}) => (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input
        type={opts.type || 'text'}
        value={form[key]}
        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
        className="input w-full"
        placeholder={opts.placeholder || ''}
        required={opts.required}
        maxLength={opts.maxLength}
      />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">
            {isEdit ? 'Edit Bank Details' : 'Add Bank Details'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {!isEdit ? (
            <div>
              <label className="block text-xs text-slate-400 mb-1">Employee *</label>
              <select value={form.employee} onChange={(e) => setForm((p) => ({ ...p, employee: e.target.value }))} className="input w-full">
                <option value="">Select employee</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.full_name} ({e.employee_id})</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="px-3 py-2 bg-slate-700/30 rounded-lg text-sm text-slate-300">
              <span className="text-slate-400">Employee: </span>
              {initial.employee_name} ({initial.employee_code})
            </div>
          )}
          {field('Account Holder Name *', 'account_holder_name', { required: true })}
          {field('Bank Name *', 'bank_name', { required: true })}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Account Number {isEdit ? '(enter new to update)' : '*'}
            </label>
            <div className="relative">
              <input type={showAcct ? 'text' : 'password'} value={form.account_number}
                onChange={(e) => setForm((p) => ({ ...p, account_number: e.target.value }))}
                className="input w-full pr-10"
                placeholder={isEdit ? 'Leave blank to keep existing' : 'Enter account number'} maxLength={30} />
              <button type="button" onClick={() => setShowAcct(!showAcct)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                {showAcct ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {field('IFSC Code *', 'ifsc_code', { required: true, maxLength: 11, placeholder: 'e.g. SBIN0001234' })}
          {field('Branch Name', 'branch_name', { placeholder: 'Optional' })}
          {field('UPI ID', 'upi_id', { placeholder: 'name@upi (optional)' })}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              PAN Number {isEdit ? '(enter new to update)' : '(optional)'}
            </label>
            <div className="relative">
              <input type={showPan ? 'text' : 'password'} value={form.pan_number}
                onChange={(e) => setForm((p) => ({ ...p, pan_number: e.target.value.toUpperCase() }))}
                className="input w-full pr-10"
                placeholder={isEdit ? 'Leave blank to keep existing' : 'e.g. ABCDE1234F'} maxLength={10} />
              <button type="button" onClick={() => setShowPan(!showPan)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                {showPan ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="flex items-start gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <Shield className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">
              Sensitive fields (account number, PAN) are encrypted at rest and visible only to HR and above.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-700">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => onSave(form)}
            disabled={!isEdit && (!form.employee || !form.account_holder_name || !form.bank_name || !form.account_number || !form.ifsc_code)}
            className="btn-primary disabled:opacity-50">
            {isEdit ? 'Save Changes' : 'Add Bank Details'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Review / Detail Modal ───────────────────────────────────────────────────
function ReviewModal({ record, onClose, onReview }) {
  const [tab, setTab] = useState('details')
  const [note, setNote] = useState('')
  const [action, setAction] = useState(null)

  const { data: history = [], isLoading: histLoading } = useQuery({
    queryKey: ['bank-history', record.id],
    queryFn: () => payrollService.bankHistory(record.id).then((r) => r.data),
    enabled: tab === 'history',
  })

  const reviewMutation = useMutation({
    mutationFn: (data) => payrollService.bankReview(record.id, data),
    onSuccess: () => {
      onReview()
      toast.success(action === 'approve' ? 'Bank details approved' : 'Bank details rejected')
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Review failed'),
  })

  const handleReview = (act) => {
    setAction(act)
    reviewMutation.mutate({ action: act, review_note: note })
  }

  const sCfg = STATUS_STYLES[record.status] || STATUS_STYLES.pending
  const SIcon = sCfg.icon

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600/30 rounded-full flex items-center justify-center text-sm text-indigo-300 font-medium">
              {initials(record.employee_name)}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{record.employee_name}</h3>
              <p className="text-xs text-slate-400">{record.employee_code} · {record.department || 'No dept'}</p>
            </div>
            <span className={`ml-3 text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 ${sCfg.cls}`}>
              <SIcon className="w-3 h-3" /> {sCfg.label}
            </span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700">
          {[{ id: 'details', label: 'Details', icon: FileText }, { id: 'history', label: 'Change History', icon: History }].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={clsx('flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors',
                tab === id ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400 hover:text-slate-200')}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'details' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500 text-xs uppercase">Account Holder</span><p className="text-slate-200 mt-0.5">{record.account_holder_name}</p></div>
                <div><span className="text-slate-500 text-xs uppercase">Bank Name</span><p className="text-slate-200 mt-0.5">{record.bank_name}</p></div>
                <div><span className="text-slate-500 text-xs uppercase">Account Number</span><p className="text-slate-200 font-mono mt-0.5">{record.account_number_display}</p></div>
                <div><span className="text-slate-500 text-xs uppercase">IFSC Code</span><p className="text-slate-200 font-mono mt-0.5">{record.ifsc_code}</p></div>
                <div><span className="text-slate-500 text-xs uppercase">Branch</span><p className="text-slate-200 mt-0.5">{record.branch_name || '—'}</p></div>
                <div><span className="text-slate-500 text-xs uppercase">UPI ID</span><p className="text-slate-200 mt-0.5">{record.upi_id || '—'}</p></div>
                <div><span className="text-slate-500 text-xs uppercase">PAN Number</span><p className="text-slate-200 font-mono mt-0.5">{record.pan_number_display || '—'}</p></div>
                <div><span className="text-slate-500 text-xs uppercase">Last Updated</span><p className="text-slate-200 mt-0.5">{formatDate(record.updated_at)}</p></div>
              </div>

              {record.reviewed_by_name && (
                <div className="mt-4 px-3 py-2 bg-slate-700/30 rounded-lg text-sm">
                  <span className="text-slate-400">Reviewed by </span>
                  <span className="text-slate-200">{record.reviewed_by_name}</span>
                  {record.reviewed_at && <span className="text-slate-500"> · {timeAgo(record.reviewed_at)}</span>}
                  {record.review_note && <p className="text-slate-300 mt-1 italic">"{record.review_note}"</p>}
                </div>
              )}

              {/* Review actions for pending records */}
              {record.status === 'pending' && (
                <div className="mt-5 pt-4 border-t border-slate-700 space-y-3">
                  <label className="block text-xs text-slate-400">Review Note (optional)</label>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note for the employee..."
                    className="input w-full resize-none" rows={2} />
                  <div className="flex gap-3">
                    <button onClick={() => handleReview('approve')}
                      disabled={reviewMutation.isPending}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors">
                      <ThumbsUp className="w-4 h-4" />
                      {reviewMutation.isPending && action === 'approve' ? 'Approving...' : 'Approve'}
                    </button>
                    <button onClick={() => handleReview('reject')}
                      disabled={reviewMutation.isPending}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors">
                      <ThumbsDown className="w-4 h-4" />
                      {reviewMutation.isPending && action === 'reject' ? 'Rejecting...' : 'Reject'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'history' && (
            <div>
              {histLoading ? (
                <p className="text-center text-slate-500 py-8">Loading history...</p>
              ) : history.length === 0 ? (
                <p className="text-center text-slate-500 py-8">No change history found.</p>
              ) : (
                <div className="space-y-3">
                  {history.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 px-3 py-2.5 bg-slate-700/20 rounded-lg">
                      <div className={clsx('w-2 h-2 rounded-full mt-2 flex-shrink-0',
                        log.change_type === 'created' ? 'bg-green-400' : 'bg-blue-400')} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200">
                          <span className="font-medium text-slate-300">{log.field_name.replace(/_/g, ' ')}</span>
                          {log.change_type === 'created' ? (
                            <span className="text-slate-400"> set to </span>
                          ) : (
                            <span className="text-slate-400"> changed from </span>
                          )}
                          {log.change_type !== 'created' && (
                            <span className="text-red-400/80 font-mono text-xs">{log.old_value || '(empty)'}</span>
                          )}
                          {log.change_type !== 'created' && <span className="text-slate-400"> → </span>}
                          <span className="text-green-400/80 font-mono text-xs">{log.new_value || '(empty)'}</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          by {log.changed_by_name} · {timeAgo(log.changed_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
export default function EmployeeBankDetailsPage() {
  const qc = useQueryClient()
  const [search, setSearch]         = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modalTarget, setModalTarget] = useState(null)   // null=closed; false=create; obj=edit
  const [reviewTarget, setReviewTarget] = useState(null)  // obj = review modal

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: depts = [] } = useQuery({
    queryKey: ['departments'],
    queryFn:  () => departmentService.list().then((r) => Array.isArray(r.data) ? r.data : r.data?.results ?? []),
  })

  const { data: bankList = [], isLoading } = useQuery({
    queryKey: ['bank-details', deptFilter, statusFilter],
    queryFn:  () => {
      const params = {}
      if (deptFilter) params.department = deptFilter
      if (statusFilter) params.status = statusFilter
      return payrollService.bankList(params).then((r) => Array.isArray(r.data) ? r.data : r.data?.results ?? [])
    },
  })

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-minimal'],
    queryFn:  () => import('../../services/api').then(({ employeeService }) =>
      employeeService.list().then((r) => Array.isArray(r.data) ? r.data : r.data?.results ?? [])
    ),
  })

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createBank = useMutation({
    mutationFn: (data) => payrollService.bankCreate(data),
    onSuccess:  () => { qc.invalidateQueries(['bank-details']); toast.success('Bank details added'); setModalTarget(null) },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed to add bank details'),
  })

  const updateBank = useMutation({
    mutationFn: ({ id, data }) => payrollService.bankUpdate(id, data),
    onSuccess:  () => { qc.invalidateQueries(['bank-details']); toast.success('Bank details updated'); setModalTarget(null) },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed to update'),
  })

  // ── Derived ───────────────────────────────────────────────────────────────
  const pendingCount = bankList.filter((b) => b.status === 'pending').length

  const filtered = bankList
    .filter((b) => {
      const q = search.toLowerCase()
      return !q || b.employee_name?.toLowerCase().includes(q) || b.employee_code?.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      // Pending first
      if (a.status === 'pending' && b.status !== 'pending') return -1
      if (b.status === 'pending' && a.status !== 'pending') return 1
      return 0
    })

  const handleSave = (form) => {
    const isEdit = modalTarget && typeof modalTarget === 'object' && modalTarget.id
    const payload = {
      account_holder_name: form.account_holder_name,
      bank_name: form.bank_name,
      ifsc_code: form.ifsc_code.toUpperCase(),
      branch_name: form.branch_name,
      upi_id: form.upi_id,
    }
    if (form.account_number) payload.account_number = form.account_number
    if (form.pan_number) payload.pan_number = form.pan_number
    if (isEdit) {
      updateBank.mutate({ id: modalTarget.id, data: payload })
    } else {
      createBank.mutate({ ...payload, employee: parseInt(form.employee), account_number: form.account_number })
    }
  }

  const handleExport = async () => {
    try {
      const res = await payrollService.bankExport()
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = 'bank_details_export.csv'
      a.click()
      URL.revokeObjectURL(url)
      toast.success('CSV exported')
    } catch {
      toast.error('Export failed')
    }
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Bank Details</h1>
            <p className="text-sm text-slate-400">Manage employee bank account information</p>
          </div>
          {pendingCount > 0 && (
            <span className="ml-2 px-2.5 py-1 bg-amber-500/20 text-amber-400 rounded-full text-xs font-semibold">
              {pendingCount} pending review
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="btn-secondary flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={() => setModalTarget(false)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Bank Details
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employees..." className="input w-full pl-9" />
        </div>

        <div className="relative">
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="input pr-8 appearance-none">
            <option value="">All Departments</option>
            {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input pr-8 appearance-none">
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>

        <p className="ml-auto text-xs text-slate-500">
          {filtered.length} record{filtered.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                {['Employee', 'Department', 'Bank Name', 'Account Number', 'IFSC Code', 'Status', 'Last Updated', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {isLoading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <CreditCard className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-500">No bank details found</p>
                  </td>
                </tr>
              ) : (
                filtered.map((b) => {
                  const sCfg = STATUS_STYLES[b.status] || STATUS_STYLES.approved
                  const SIcon = sCfg.icon
                  return (
                    <tr key={b.id} className={clsx('hover:bg-slate-700/20 transition-colors cursor-pointer',
                      b.status === 'pending' && 'bg-amber-500/5')}
                      onClick={() => setReviewTarget(b)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-indigo-600/30 rounded-full flex items-center justify-center text-xs text-indigo-300 font-medium flex-shrink-0">
                            {initials(b.employee_name)}
                          </div>
                          <div>
                            <p className="text-white font-medium">{b.employee_name}</p>
                            <p className="text-xs text-slate-400">{b.employee_code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{b.department || '—'}</td>
                      <td className="px-4 py-3 text-slate-200 whitespace-nowrap">{b.bank_name}</td>
                      <td className="px-4 py-3 font-mono text-slate-300 whitespace-nowrap">{b.account_number_display}</td>
                      <td className="px-4 py-3 font-mono text-slate-300 whitespace-nowrap">{b.ifsc_code}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${sCfg.cls}`}>
                          <SIcon className="w-3 h-3" /> {sCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                        {new Date(b.updated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setModalTarget(b)}
                          className="p-1.5 hover:bg-indigo-500/20 rounded-lg transition-colors text-slate-400 hover:text-indigo-400" title="Edit">
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / Create Modal */}
      {modalTarget !== null && (
        <BankDetailsModal
          onClose={() => setModalTarget(null)}
          onSave={handleSave}
          initial={typeof modalTarget === 'object' && modalTarget ? modalTarget : null}
          employees={employees}
        />
      )}

      {/* Review / Detail Modal */}
      {reviewTarget && (
        <ReviewModal
          record={reviewTarget}
          onClose={() => setReviewTarget(null)}
          onReview={() => {
            qc.invalidateQueries(['bank-details'])
            setReviewTarget(null)
          }}
        />
      )}
    </div>
  )
}
