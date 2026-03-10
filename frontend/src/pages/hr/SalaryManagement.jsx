import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BadgeDollarSign, Plus, Search, Edit2, X, ChevronDown,
  CreditCard, Calendar, DollarSign, Check, AlertCircle,
} from 'lucide-react'
import { payrollService } from '../../services/api'
import { departmentService } from '../../services/api'
import { formatCurrency, initials } from '../../utils/helpers'
import toast from 'react-hot-toast'
import clsx from 'clsx'

// ── Payment status badge ────────────────────────────────────────────────────
function PaymentStatusBadge({ status }) {
  if (status === 'paid')    return <span className="payment-paid">Paid</span>
  if (status === 'pending') return <span className="payment-pending">Pending</span>
  return <span className="payment-not_generated">Not Generated</span>
}

// ── Net salary preview (frontend formula) ──────────────────────────────────
function calcNet(f) {
  const n = (k) => parseFloat(f[k] || 0)
  return n('base_salary') + n('hra') + n('allowances') + n('bonus') - n('deductions') - n('tax')
}

// ── Salary modal (Create / Edit) ────────────────────────────────────────────
function SalaryModal({ onClose, onSave, initial = null, employees = [] }) {
  const isEdit = !!initial
  const [form, setForm] = useState({
    employee:       initial?.employee ?? '',
    base_salary:    initial?.base_salary ?? '',
    hra:            initial?.hra ?? '',
    allowances:     initial?.allowances ?? '',
    bonus:          initial?.bonus ?? '',
    deductions:     initial?.deductions ?? '',
    tax:            initial?.tax ?? '',
    salary_cycle:   initial?.salary_cycle ?? 'monthly',
    effective_from: initial?.effective_from ?? '',
  })

  const net = calcNet(form)

  const numField = (label, key) => (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input
        type="number"
        min="0"
        step="0.01"
        value={form[key]}
        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
        className="input w-full"
        placeholder="0.00"
      />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">
            {isEdit ? 'Edit Salary Structure' : 'Add Salary Structure'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Employee selector (create only) */}
          {!isEdit && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">Employee *</label>
              <select
                value={form.employee}
                onChange={(e) => setForm((p) => ({ ...p, employee: e.target.value }))}
                className="input w-full"
              >
                <option value="">Select employee</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name} ({e.employee_id})
                  </option>
                ))}
              </select>
            </div>
          )}

          {isEdit && (
            <div className="px-3 py-2 bg-slate-700/30 rounded-lg text-sm text-slate-300">
              <span className="text-slate-400">Employee: </span>
              {initial.employee_name} ({initial.employee_code})
            </div>
          )}

          {/* Earnings */}
          <div>
            <p className="text-xs font-medium text-green-400 uppercase tracking-wider mb-2">Earnings</p>
            <div className="grid grid-cols-2 gap-3">
              {numField('Base Salary (₹)', 'base_salary')}
              {numField('HRA (₹)', 'hra')}
              {numField('Allowances (₹)', 'allowances')}
              {numField('Bonus (₹)', 'bonus')}
            </div>
          </div>

          {/* Deductions */}
          <div>
            <p className="text-xs font-medium text-red-400 uppercase tracking-wider mb-2">Deductions</p>
            <div className="grid grid-cols-2 gap-3">
              {numField('Deductions (₹)', 'deductions')}
              {numField('Tax (₹)', 'tax')}
            </div>
          </div>

          {/* Net salary preview */}
          <div className="flex items-center justify-between px-4 py-3 bg-indigo-500/10 border border-indigo-500/30 rounded-lg">
            <span className="text-sm font-medium text-slate-300">Net Salary (preview)</span>
            <span className={clsx(
              'text-lg font-bold',
              net >= 0 ? 'text-indigo-300' : 'text-red-400'
            )}>
              {formatCurrency(net)}
            </span>
          </div>

          {/* Cycle + Effective */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Salary Cycle</label>
              <select
                value={form.salary_cycle}
                onChange={(e) => setForm((p) => ({ ...p, salary_cycle: e.target.value }))}
                className="input w-full"
              >
                <option value="monthly">Monthly</option>
                <option value="bimonthly">Bi-monthly</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Effective From</label>
              <input
                type="date"
                value={form.effective_from}
                onChange={(e) => setForm((p) => ({ ...p, effective_from: e.target.value }))}
                className="input w-full"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-700">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={() => onSave(form)}
            disabled={!isEdit && !form.employee}
            className="btn-primary disabled:opacity-50"
          >
            {isEdit ? 'Save Changes' : 'Create Structure'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Create Payment Modal ────────────────────────────────────────────────────
function CreatePaymentModal({ onClose, onSave, employees = [] }) {
  const now = new Date()
  const [form, setForm] = useState({
    employee:       '',
    month:          now.getMonth() + 1,
    year:           now.getFullYear(),
    amount_paid:    '',
    payment_method: 'bank_transfer',
    notes:          '',
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">Create Payment Record</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded-lg">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Employee *</label>
            <select
              value={form.employee}
              onChange={(e) => setForm((p) => ({ ...p, employee: e.target.value }))}
              className="input w-full"
            >
              <option value="">Select employee</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name} ({e.employee_id})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Month</label>
              <select
                value={form.month}
                onChange={(e) => setForm((p) => ({ ...p, month: +e.target.value }))}
                className="input w-full"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(0, i).toLocaleString('default', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Year</label>
              <input
                type="number"
                value={form.year}
                onChange={(e) => setForm((p) => ({ ...p, year: +e.target.value }))}
                min="2020"
                max="2099"
                className="input w-full"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Amount Paid (₹) *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount_paid}
              onChange={(e) => setForm((p) => ({ ...p, amount_paid: e.target.value }))}
              className="input w-full"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Payment Method</label>
            <select
              value={form.payment_method}
              onChange={(e) => setForm((p) => ({ ...p, payment_method: e.target.value }))}
              className="input w-full"
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="upi">UPI</option>
              <option value="cash">Cash</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
              className="input w-full resize-none"
              placeholder="Optional notes..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-700">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={() => onSave(form)}
            disabled={!form.employee || !form.amount_paid}
            className="btn-primary disabled:opacity-50"
          >
            Create Payment
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Mark Paid Modal ─────────────────────────────────────────────────────────
function MarkPaidModal({ payment, onClose, onSave }) {
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({
    payment_status:  'paid',
    payment_method:  payment?.payment_method || 'bank_transfer',
    payment_date:    payment?.payment_date || today,
    amount_paid:     payment?.amount_paid || '',
    notes:           payment?.notes || '',
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">Mark as Paid</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded-lg">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="px-3 py-2 bg-slate-700/30 rounded-lg text-sm text-slate-300">
            <span className="text-slate-400">Employee: </span>
            {payment?.employee_name} —{' '}
            {new Date(0, payment?.month - 1).toLocaleString('default', { month: 'long' })} {payment?.year}
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Amount Paid (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount_paid}
              onChange={(e) => setForm((p) => ({ ...p, amount_paid: e.target.value }))}
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Payment Method</label>
            <select
              value={form.payment_method}
              onChange={(e) => setForm((p) => ({ ...p, payment_method: e.target.value }))}
              className="input w-full"
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="upi">UPI</option>
              <option value="cash">Cash</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Payment Date</label>
            <input
              type="date"
              value={form.payment_date}
              onChange={(e) => setForm((p) => ({ ...p, payment_date: e.target.value }))}
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
              className="input w-full resize-none"
              placeholder="Optional..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-700">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={() => onSave(form)}
            className="btn-primary flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            Confirm Payment
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Month name helper ───────────────────────────────────────────────────────
function monthName(n) {
  return new Date(0, n - 1).toLocaleString('default', { month: 'short' })
}

// ══════════════════════════════════════════════════════════════════════════════
// SalaryManagement Page
// ══════════════════════════════════════════════════════════════════════════════
export default function SalaryManagement() {
  const qc = useQueryClient()
  const [tab, setTab] = useState(0)   // 0 = Structures, 1 = Payments

  // ── Structures tab state ─────────────────────────────────────────────────
  const [salarySearch,  setSalarySearch]  = useState('')
  const [salaryDeptFilter, setSalaryDeptFilter] = useState('')
  const [showSalaryModal, setShowSalaryModal] = useState(false)
  const [editSalary, setEditSalary] = useState(null)  // null = create

  // ── Payments tab state ───────────────────────────────────────────────────
  const now = new Date()
  const [payMonth, setPayMonth] = useState(now.getMonth() + 1)
  const [payYear,  setPayYear]  = useState(now.getFullYear())
  const [payDeptFilter, setPayDeptFilter] = useState('')
  const [payStatusFilter, setPayStatusFilter] = useState('')
  const [showCreatePayment, setShowCreatePayment] = useState(false)
  const [markPaidTarget, setMarkPaidTarget] = useState(null)

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: depts = [] } = useQuery({
    queryKey: ['departments'],
    queryFn:  () => departmentService.list().then((r) => Array.isArray(r.data) ? r.data : r.data?.results ?? []),
  })

  const { data: salaries = [], isLoading: loadSalaries } = useQuery({
    queryKey: ['salaries', salaryDeptFilter],
    queryFn:  () => payrollService.salaryList(
      salaryDeptFilter ? { department: salaryDeptFilter } : {}
    ).then((r) => Array.isArray(r.data) ? r.data : r.data?.results ?? []),
  })

  const { data: payments = [], isLoading: loadPayments } = useQuery({
    queryKey: ['payments', payMonth, payYear, payDeptFilter, payStatusFilter],
    queryFn:  () => payrollService.paymentList({
      month:  payMonth,
      year:   payYear,
      ...(payDeptFilter   && { department: payDeptFilter }),
      ...(payStatusFilter && { status: payStatusFilter }),
    }).then((r) => Array.isArray(r.data) ? r.data : r.data?.results ?? []),
  })

  // Fetch employees list for dropdowns
  const { data: employees = [] } = useQuery({
    queryKey: ['employees-minimal'],
    queryFn:  () => import('../../services/api').then(({ employeeService }) =>
      employeeService.list().then((r) => Array.isArray(r.data) ? r.data : r.data?.results ?? [])
    ),
  })

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createSalary = useMutation({
    mutationFn: (data) => payrollService.salaryCreate(data),
    onSuccess:  () => { qc.invalidateQueries(['salaries']); toast.success('Salary structure created'); setShowSalaryModal(false) },
    onError:    (e) => toast.error(e.response?.data?.detail || 'Failed to create salary structure'),
  })

  const updateSalary = useMutation({
    mutationFn: ({ id, data }) => payrollService.salaryUpdate(id, data),
    onSuccess:  () => { qc.invalidateQueries(['salaries']); toast.success('Salary structure updated'); setEditSalary(null) },
    onError:    (e) => toast.error(e.response?.data?.detail || 'Failed to update'),
  })

  const createPayment = useMutation({
    mutationFn: (data) => payrollService.paymentCreate(data),
    onSuccess:  () => { qc.invalidateQueries(['payments']); toast.success('Payment record created'); setShowCreatePayment(false) },
    onError:    (e) => toast.error(e.response?.data?.detail || 'Failed to create payment'),
  })

  const updatePayment = useMutation({
    mutationFn: ({ id, data }) => payrollService.paymentUpdate(id, data),
    onSuccess:  () => { qc.invalidateQueries(['payments']); toast.success('Payment marked as paid'); setMarkPaidTarget(null) },
    onError:    (e) => toast.error(e.response?.data?.detail || 'Failed to update payment'),
  })

  const genPayslip = useMutation({
    mutationFn: (paymentId) => payrollService.payslipGenerate({ payment_id: paymentId }),
    onSuccess:  (res) => {
      qc.invalidateQueries(['payments'])
      toast.success('Payslip generated')
      // auto-download
      payrollService.payslipDownload(res.data.id).then((blob) => {
        const url = URL.createObjectURL(new Blob([blob.data], { type: 'application/pdf' }))
        window.open(url, '_blank')
        setTimeout(() => URL.revokeObjectURL(url), 30000)
      }).catch(() => toast.error('Download failed'))
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed to generate payslip'),
  })

  // ── Filtered salaries ─────────────────────────────────────────────────────
  const filteredSalaries = salaries.filter((s) => {
    const q = salarySearch.toLowerCase()
    return !q || s.employee_name?.toLowerCase().includes(q) || s.employee_code?.toLowerCase().includes(q)
  })

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSalaryModalSave = (form) => {
    const payload = {
      employee:       parseInt(form.employee),
      base_salary:    parseFloat(form.base_salary || 0),
      hra:            parseFloat(form.hra || 0),
      allowances:     parseFloat(form.allowances || 0),
      bonus:          parseFloat(form.bonus || 0),
      deductions:     parseFloat(form.deductions || 0),
      tax:            parseFloat(form.tax || 0),
      salary_cycle:   form.salary_cycle,
      effective_from: form.effective_from || null,
    }
    if (editSalary) {
      updateSalary.mutate({ id: editSalary.id, data: payload })
    } else {
      createSalary.mutate(payload)
    }
  }

  const handleMarkPaidSave = (form) => {
    updatePayment.mutate({ id: markPaidTarget.id, data: form })
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
            <BadgeDollarSign className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Salary Management</h1>
            <p className="text-sm text-slate-400">Manage salary structures & payment records</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-800/50 border border-slate-700 rounded-xl w-fit">
        {['Salary Structures', 'Payment Records'].map((t, i) => (
          <button
            key={i}
            onClick={() => setTab(i)}
            className={clsx(
              'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
              tab === i
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ─── Tab 0: Salary Structures ─────────────────────────────────────── */}
      {tab === 0 && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={salarySearch}
                onChange={(e) => setSalarySearch(e.target.value)}
                placeholder="Search employees..."
                className="input w-full pl-9"
              />
            </div>

            {/* Dept filter */}
            <div className="relative">
              <select
                value={salaryDeptFilter}
                onChange={(e) => setSalaryDeptFilter(e.target.value)}
                className="input pr-8 appearance-none"
              >
                <option value="">All Departments</option>
                {depts.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>

            <div className="ml-auto">
              <button
                onClick={() => { setEditSalary(null); setShowSalaryModal(true) }}
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Structure
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    {['Employee', 'Dept', 'Base Salary', 'HRA', 'Allowances', 'Bonus', 'Deductions', 'Tax', 'Net Salary', 'Effective From', 'Actions'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {loadSalaries ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-8 text-center text-slate-500">Loading...</td>
                    </tr>
                  ) : filteredSalaries.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-8 text-center text-slate-500">No salary structures found</td>
                    </tr>
                  ) : (
                    filteredSalaries.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-700/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-indigo-600/30 rounded-full flex items-center justify-center text-xs text-indigo-300 font-medium flex-shrink-0">
                              {initials(s.employee_name)}
                            </div>
                            <div>
                              <p className="text-white font-medium truncate max-w-[140px]">{s.employee_name}</p>
                              <p className="text-xs text-slate-400">{s.employee_code}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{s.department || '—'}</td>
                        <td className="px-4 py-3 text-slate-200 whitespace-nowrap">{formatCurrency(s.base_salary)}</td>
                        <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{formatCurrency(s.hra)}</td>
                        <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{formatCurrency(s.allowances)}</td>
                        <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{formatCurrency(s.bonus)}</td>
                        <td className="px-4 py-3 text-red-300 whitespace-nowrap">{formatCurrency(s.deductions)}</td>
                        <td className="px-4 py-3 text-red-300 whitespace-nowrap">{formatCurrency(s.tax)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-green-400 font-semibold">{formatCurrency(s.net_salary)}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{s.effective_from || '—'}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => { setEditSalary(s); setShowSalaryModal(true) }}
                            className="p-1.5 hover:bg-indigo-500/20 rounded-lg transition-colors text-slate-400 hover:text-indigo-400"
                            title="Edit salary structure"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── Tab 1: Payment Records ───────────────────────────────────────── */}
      {tab === 1 && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Month selector */}
            <select
              value={payMonth}
              onChange={(e) => setPayMonth(+e.target.value)}
              className="input"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(0, i).toLocaleString('default', { month: 'long' })}
                </option>
              ))}
            </select>

            {/* Year input */}
            <input
              type="number"
              value={payYear}
              onChange={(e) => setPayYear(+e.target.value)}
              min="2020"
              max="2099"
              className="input w-24"
            />

            {/* Dept filter */}
            <div className="relative">
              <select
                value={payDeptFilter}
                onChange={(e) => setPayDeptFilter(e.target.value)}
                className="input pr-8 appearance-none"
              >
                <option value="">All Depts</option>
                {depts.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>

            {/* Status filter */}
            <div className="relative">
              <select
                value={payStatusFilter}
                onChange={(e) => setPayStatusFilter(e.target.value)}
                className="input pr-8 appearance-none"
              >
                <option value="">All Status</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>

            <div className="ml-auto">
              <button
                onClick={() => setShowCreatePayment(true)}
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Create Payment
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    {['Employee', 'Month/Year', 'Amount', 'Method', 'Payment Date', 'Status', 'Payslip', 'Actions'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {loadPayments ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500">Loading...</td>
                    </tr>
                  ) : payments.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                        No payment records for {monthName(payMonth)} {payYear}
                      </td>
                    </tr>
                  ) : (
                    payments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-700/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-indigo-600/30 rounded-full flex items-center justify-center text-xs text-indigo-300 font-medium flex-shrink-0">
                              {initials(p.employee_name)}
                            </div>
                            <div>
                              <p className="text-white font-medium">{p.employee_name}</p>
                              <p className="text-xs text-slate-400">{p.employee_code}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                          {monthName(p.month)} {p.year}
                        </td>
                        <td className="px-4 py-3 text-green-400 font-semibold whitespace-nowrap">
                          {formatCurrency(p.amount_paid)}
                        </td>
                        <td className="px-4 py-3 text-slate-300 capitalize whitespace-nowrap">
                          {p.payment_method?.replace('_', ' ') || '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                          {p.payment_date || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <PaymentStatusBadge status={p.payment_status} />
                        </td>
                        <td className="px-4 py-3">
                          {p.has_payslip ? (
                            <span className="badge bg-green-500/10 text-green-400 border border-green-500/20">
                              Generated
                            </span>
                          ) : (
                            <span className="badge bg-slate-500/10 text-slate-400 border border-slate-500/20">
                              None
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {p.payment_status === 'pending' && (
                              <button
                                onClick={() => setMarkPaidTarget(p)}
                                className="p-1.5 hover:bg-green-500/20 rounded-lg transition-colors text-slate-400 hover:text-green-400"
                                title="Mark as paid"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            {!p.has_payslip && (
                              <button
                                onClick={() => genPayslip.mutate(p.id)}
                                disabled={genPayslip.isPending}
                                className="p-1.5 hover:bg-indigo-500/20 rounded-lg transition-colors text-slate-400 hover:text-indigo-400 disabled:opacity-50"
                                title="Generate & download payslip"
                              >
                                <DollarSign className="w-4 h-4" />
                              </button>
                            )}
                            {p.has_payslip && (
                              <button
                                onClick={() => {
                                  // find payslip ID via payslip list query — just trigger a download via payments list
                                  payrollService.payslipList({ employee: p.employee, month: p.month, year: p.year })
                                    .then((res) => {
                                      const list = Array.isArray(res.data) ? res.data : res.data?.results ?? []
                                      const ps = list.find((x) => x.payment === p.id)
                                      if (ps) {
                                        payrollService.payslipDownload(ps.id).then((blob) => {
                                          const url = URL.createObjectURL(new Blob([blob.data], { type: 'application/pdf' }))
                                          window.open(url, '_blank')
                                          setTimeout(() => URL.revokeObjectURL(url), 30000)
                                        })
                                      } else {
                                        toast.error('Payslip not found')
                                      }
                                    })
                                    .catch(() => toast.error('Download failed'))
                                }}
                                className="p-1.5 hover:bg-green-500/20 rounded-lg transition-colors text-slate-400 hover:text-green-400"
                                title="Download payslip"
                              >
                                <Calendar className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showSalaryModal && (
        <SalaryModal
          onClose={() => { setShowSalaryModal(false); setEditSalary(null) }}
          onSave={handleSalaryModalSave}
          initial={editSalary}
          employees={employees}
        />
      )}

      {showCreatePayment && (
        <CreatePaymentModal
          onClose={() => setShowCreatePayment(false)}
          onSave={(form) => createPayment.mutate(form)}
          employees={employees}
        />
      )}

      {markPaidTarget && (
        <MarkPaidModal
          payment={markPaidTarget}
          onClose={() => setMarkPaidTarget(null)}
          onSave={handleMarkPaidSave}
        />
      )}
    </div>
  )
}
