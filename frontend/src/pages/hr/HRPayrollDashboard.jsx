import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { Wallet, UserCheck, Clock, Users, Download, CheckCircle, AlertTriangle, Copy, Check, Eye } from 'lucide-react'
import { payrollService, departmentService } from '../../services/api'
import { formatCurrency, initials } from '../../utils/helpers'
import StatCard from '../../components/common/StatCard'
import clsx from 'clsx'
import toast from 'react-hot-toast'

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4']

function PaymentStatusBadge({ status }) {
  const map = {
    paid:          'payment-paid',
    pending:       'payment-pending',
    not_generated: 'payment-not_generated',
  }
  const labels = { paid: 'Paid', pending: 'Pending', not_generated: 'Not Created' }
  return (
    <span className={map[status] || 'payment-not_generated'}>
      {labels[status] || status}
    </span>
  )
}

// ── Copy Button ───────────────────────────────────────────────────────────────
function CopyBtn({ value }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    if (!value) return
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button type="button" onClick={handleCopy}
      className="p-1 rounded hover:bg-slate-600 transition-colors text-slate-500 hover:text-slate-300"
      title="Copy">
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
    </button>
  )
}

// ── Mark Paid Modal ────────────────────────────────────────────────────────────
function MarkPaidModal({ row, onClose, onSave }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    payment_method: 'bank_transfer',
    payment_date:   today,
    notes: '',
  })
  const [creating, setCreating] = useState(false)
  const hasBank = row.bank_status === 'approved' && row.account_number

  const handleSubmit = async (e) => {
    e.preventDefault()
    setCreating(true)
    try {
      await onSave(row, form)
      onClose()
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h3 className="font-semibold text-slate-200">Mark Salary as Paid</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Employee + Salary info */}
          <div className="bg-slate-700/40 rounded-lg p-3 text-sm">
            <p className="text-slate-300"><span className="text-slate-400">Employee:</span> {row.employee_name} <span className="text-slate-500">({row.employee_code})</span></p>
            <p className="text-slate-300 mt-1"><span className="text-slate-400">Net Salary:</span> <span className="text-green-400 font-semibold">{formatCurrency(row.net_salary)}</span></p>
          </div>

          {/* Bank Details — Transfer To */}
          {hasBank ? (
            <div className="border border-indigo-500/20 bg-indigo-500/5 rounded-lg p-4 space-y-2.5">
              <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wide mb-2">Transfer To</p>
              <div className="grid grid-cols-2 gap-2.5 text-sm">
                <div>
                  <p className="text-[11px] text-slate-500">Account Holder</p>
                  <p className="text-slate-200">{row.account_holder_name}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500">Bank</p>
                  <p className="text-slate-200">{row.bank_name}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] text-slate-500">Account Number</p>
                  <div className="flex items-center gap-2">
                    <p className="text-slate-200 font-mono">{row.account_number}</p>
                    <CopyBtn value={row.account_number} />
                  </div>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500">IFSC Code</p>
                  <div className="flex items-center gap-2">
                    <p className="text-slate-200 font-mono">{row.ifsc_code}</p>
                    <CopyBtn value={row.ifsc_code} />
                  </div>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500">Branch</p>
                  <p className="text-slate-300">{row.branch_name || '—'}</p>
                </div>
                {row.upi_id && (
                  <div className="col-span-2">
                    <p className="text-[11px] text-slate-500">UPI ID</p>
                    <div className="flex items-center gap-2">
                      <p className="text-slate-200">{row.upi_id}</p>
                      <CopyBtn value={row.upi_id} />
                    </div>
                  </div>
                )}
                {row.passbook_photo_url && (
                  <div className="col-span-2 pt-1">
                    <p className="text-[11px] text-slate-500 mb-1">Passbook Photo</p>
                    <a href={row.passbook_photo_url} target="_blank" rel="noopener noreferrer">
                      <img src={row.passbook_photo_url} alt="Passbook"
                        className="max-h-24 rounded-lg border border-slate-600 hover:border-indigo-500 transition-colors cursor-pointer" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <p className="text-xs text-amber-300">No bank details on file. Employee has not submitted bank account information.</p>
            </div>
          )}

          {/* Payment details */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Payment Method</label>
            <select
              className="input w-full text-sm"
              value={form.payment_method}
              onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="upi">UPI</option>
              <option value="cash">Cash</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Payment Date</label>
            <input
              type="date"
              className="input w-full text-sm"
              value={form.payment_date}
              onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Notes (optional)</label>
            <textarea
              className="input w-full text-sm resize-none"
              rows={2}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={creating} className="btn-primary flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              {creating ? 'Saving...' : 'Mark as Paid'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function HRPayrollDashboard() {
  const today   = new Date()
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [year,  setYear]  = useState(today.getFullYear())
  const [deptFilter,   setDeptFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [markPaidRow,  setMarkPaidRow]  = useState(null)
  const [bankViewRow,  setBankViewRow]  = useState(null)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['payroll-dashboard', month, year, deptFilter, statusFilter],
    queryFn:  () => payrollService.dashboard({
      month, year,
      ...(deptFilter   && { department: deptFilter }),
      ...(statusFilter && { payment_status: statusFilter }),
    }).then(r => r.data),
  })

  const { data: deptData } = useQuery({
    queryKey: ['departments'],
    queryFn:  () => departmentService.list().then(r => Array.isArray(r.data) ? r.data : r.data?.results ?? []),
  })
  const departments = deptData?.results || deptData || []

  const createPaymentMutation = useMutation({
    mutationFn: (data) => payrollService.paymentCreate(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['payroll-dashboard'] }),
    onError:    (err) => toast.error(err?.response?.data?.detail || 'Failed to create payment'),
  })

  const updatePaymentMutation = useMutation({
    mutationFn: ({ id, data }) => payrollService.paymentUpdate(id, data),
    onSuccess:  () => {
      toast.success('Salary marked as paid & payslip auto-generated')
      qc.invalidateQueries({ queryKey: ['payroll-dashboard'] })
    },
    onError: (err) => toast.error(err?.response?.data?.detail || 'Update failed'),
  })

  const generateMutation = useMutation({
    mutationFn: (paymentId) => payrollService.payslipGenerate({ payment_id: paymentId }),
    onSuccess:  (res) => {
      toast.success('Payslip generated')
      handleDownload(res.data.id)
      qc.invalidateQueries({ queryKey: ['payroll-dashboard'] })
    },
    onError: (err) => toast.error(err?.response?.data?.detail || 'Generate failed'),
  })

  const handleDownload = async (payslipId) => {
    try {
      const res = await payrollService.payslipDownload(payslipId)
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      window.open(url, '_blank')
    } catch {
      toast.error('Download failed')
    }
  }

  const handleMarkPaidSave = async (row, form) => {
    if (row.payment_id) {
      // Update existing payment to 'paid'
      await updatePaymentMutation.mutateAsync({
        id:   row.payment_id,
        data: { payment_status: 'paid', ...form },
      })
    } else {
      // Create new payment record marked as paid
      const today_ = new Date()
      await createPaymentMutation.mutateAsync({
        employee:       row.employee_id,
        month,
        year,
        amount_paid:    row.net_salary,
        payment_status: 'paid',
        ...form,
      })
    }
  }

  const rows = data?.employee_rows || []

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Payroll Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">Manage and track employee salary payments</p>
        </div>
        {/* Month / Year selector */}
        <div className="flex gap-2">
          <select
            className="input text-sm"
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
          >
            {MONTHS.map((m, i) => <option key={m} value={i+1}>{m}</option>)}
          </select>
          <select
            className="input text-sm"
            value={year}
            onChange={e => setYear(Number(e.target.value))}
          >
            {[today.getFullYear()-1, today.getFullYear(), today.getFullYear()+1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stat Cards */}
      {!isLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Payroll"
            value={formatCurrency(data?.total_payroll ?? 0)}
            icon={Wallet}
            color="green"
            subtitle={`${MONTHS[month-1]} ${year}`}
          />
          <StatCard
            title="Employees Paid"
            value={data?.employees_paid ?? 0}
            icon={UserCheck}
            color="indigo"
          />
          <StatCard
            title="Pending Payments"
            value={data?.pending_payments ?? 0}
            icon={Clock}
            color="orange"
          />
          <StatCard
            title="Unpaid Employees"
            value={data?.unpaid_employees ?? 0}
            icon={Users}
            color="red"
          />
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Payroll by department */}
        <div className="card">
          <h2 className="text-base font-semibold mb-4">Payroll by Department</h2>
          {(data?.payroll_by_department?.length ?? 0) > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.payroll_by_department} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="dept_name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  formatter={v => [formatCurrency(v), 'Payroll']}
                />
                <Bar dataKey="total" radius={[4,4,0,0]}>
                  {(data.payroll_by_department || []).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-500 text-sm text-center py-10">No payment data for this period</p>
          )}
        </div>

        {/* Monthly trend */}
        <div className="card">
          <h2 className="text-base font-semibold mb-4">Monthly Payroll Trend</h2>
          {(data?.monthly_trend?.length ?? 0) > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data.monthly_trend} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  formatter={v => [formatCurrency(v), 'Total Payroll']}
                />
                <Line type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1', r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-500 text-sm text-center py-10">No trend data yet</p>
          )}
        </div>
      </div>

      {/* Employee Payroll Table */}
      <div className="card overflow-hidden p-0">
        {/* Table filters */}
        <div className="p-4 border-b border-slate-700 flex flex-wrap gap-3">
          <h2 className="text-base font-semibold text-slate-200 flex-1">Employee Payroll</h2>
          <select
            className="input text-sm"
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
          >
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select
            className="input text-sm"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="not_generated">Not Created</option>
          </select>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No salary structures found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-700">
                <tr>
                  {['Employee','Dept','Bank','Base Salary','Deductions','Net Salary','Status','Actions'].map(h => (
                    <th key={h} className="th text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {rows.map(row => (
                  <tr key={row.employee_id} className="table-row">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-xs font-semibold text-white">
                          {initials(row.employee_name)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-200">{row.employee_name}</p>
                          <p className="text-xs text-slate-500">{row.employee_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">{row.department || '—'}</td>
                    <td className="px-4 py-3">
                      {row.bank_status === 'approved' ? (
                        <button onClick={() => setBankViewRow(row)}
                          className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors cursor-pointer"
                          title="Click to view bank details">
                          {row.bank_name || 'Approved'}
                        </button>
                      ) : row.bank_status === 'pending' ? (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400">Pending</span>
                      ) : row.bank_status === 'rejected' ? (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">Rejected</span>
                      ) : (
                        <span className="text-[11px] text-slate-500">Not added</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">{formatCurrency(row.base_salary)}</td>
                    <td className="px-4 py-3 text-sm text-red-400">{formatCurrency(row.deductions)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-green-400">{formatCurrency(row.net_salary)}</td>
                    <td className="px-4 py-3"><PaymentStatusBadge status={row.payment_status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {row.payment_status !== 'paid' && (
                          row.bank_status === 'approved' ? (
                            <button
                              onClick={() => setMarkPaidRow(row)}
                              className="px-2 py-1 text-xs bg-green-600/20 text-green-400 hover:bg-green-600/30 rounded-lg border border-green-500/20"
                            >
                              Mark Paid
                            </button>
                          ) : (
                            <span className="flex items-center gap-1 text-[11px] text-amber-400" title="Bank details must be approved before paying">
                              <AlertTriangle className="w-3 h-3" /> No bank
                            </span>
                          )
                        )}
                        {row.payment_status === 'paid' && !row.has_payslip && row.payment_id && (
                          <button
                            onClick={() => generateMutation.mutate(row.payment_id)}
                            disabled={generateMutation.isPending}
                            className="px-2 py-1 text-xs bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 rounded-lg border border-indigo-500/20"
                          >
                            Gen Payslip
                          </button>
                        )}
                        {row.bank_status === 'approved' && (
                          <button
                            onClick={() => setBankViewRow(row)}
                            className="px-2 py-1 text-xs bg-slate-600/20 text-slate-300 hover:bg-slate-600/30 rounded-lg border border-slate-500/20 flex items-center gap-1"
                            title="View bank account details"
                          >
                            <Eye className="w-3 h-3" /> View Details
                          </button>
                        )}
                        {row.has_payslip && row.payslip_id && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDownload(row.payslip_id)}
                              className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-700 rounded-lg"
                              title="Download Payslip"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            {row.payslip_auto_generated && (
                              <span className="text-[10px] text-green-400/60 bg-green-500/10 px-1.5 py-0.5 rounded">Auto</span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {markPaidRow && (
        <MarkPaidModal
          row={markPaidRow}
          onClose={() => setMarkPaidRow(null)}
          onSave={handleMarkPaidSave}
        />
      )}

      {/* Bank Details Popup — view anytime by clicking bank name */}
      {bankViewRow && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md fade-in">
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <div>
                <h3 className="font-semibold text-slate-200">{bankViewRow.employee_name}</h3>
                <p className="text-xs text-slate-500">{bankViewRow.employee_code}</p>
              </div>
              <button onClick={() => setBankViewRow(null)} className="text-slate-400 hover:text-slate-200 text-xl leading-none">&times;</button>
            </div>
            <div className="p-5">
              <div className="border border-indigo-500/20 bg-indigo-500/5 rounded-lg p-4 space-y-2.5">
                <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wide mb-2">Bank Account Details</p>
                <div className="grid grid-cols-2 gap-2.5 text-sm">
                  <div>
                    <p className="text-[11px] text-slate-500">Account Holder</p>
                    <p className="text-slate-200">{bankViewRow.account_holder_name}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">Bank</p>
                    <p className="text-slate-200">{bankViewRow.bank_name}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[11px] text-slate-500">Account Number</p>
                    <div className="flex items-center gap-2">
                      <p className="text-slate-200 font-mono">{bankViewRow.account_number}</p>
                      <CopyBtn value={bankViewRow.account_number} />
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">IFSC Code</p>
                    <div className="flex items-center gap-2">
                      <p className="text-slate-200 font-mono">{bankViewRow.ifsc_code}</p>
                      <CopyBtn value={bankViewRow.ifsc_code} />
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">Branch</p>
                    <p className="text-slate-300">{bankViewRow.branch_name || '—'}</p>
                  </div>
                  {bankViewRow.upi_id && (
                    <div className="col-span-2">
                      <p className="text-[11px] text-slate-500">UPI ID</p>
                      <div className="flex items-center gap-2">
                        <p className="text-slate-200">{bankViewRow.upi_id}</p>
                        <CopyBtn value={bankViewRow.upi_id} />
                      </div>
                    </div>
                  )}
                  {bankViewRow.passbook_photo_url && (
                    <div className="col-span-2 pt-1">
                      <p className="text-[11px] text-slate-500 mb-1">Passbook Photo</p>
                      <a href={bankViewRow.passbook_photo_url} target="_blank" rel="noopener noreferrer">
                        <img src={bankViewRow.passbook_photo_url} alt="Passbook"
                          className="max-h-24 rounded-lg border border-slate-600 hover:border-indigo-500 transition-colors cursor-pointer" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
