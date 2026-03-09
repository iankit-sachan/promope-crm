import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileDown, Search, Download, RefreshCw, ChevronDown,
  FileText, Calendar, DollarSign, AlertCircle,
} from 'lucide-react'
import { payrollService } from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { formatCurrency, initials } from '../../utils/helpers'
import toast from 'react-hot-toast'
import clsx from 'clsx'

// ── Payment status badge ─────────────────────────────────────────────────────
function PaymentStatusBadge({ status }) {
  if (status === 'paid')    return <span className="payment-paid">Paid</span>
  if (status === 'pending') return <span className="payment-pending">Pending</span>
  return <span className="payment-not_generated">Not Generated</span>
}

// ── Month name ────────────────────────────────────────────────────────────────
function monthName(n) {
  return new Date(0, n - 1).toLocaleString('default', { month: 'long' })
}

// ── Download blob helper ──────────────────────────────────────────────────────
async function downloadPayslipPDF(id) {
  try {
    const res = await payrollService.payslipDownload(id)
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  } catch {
    toast.error('Download failed. Please try again.')
  }
}

// ── Payslip Card (employee view) ─────────────────────────────────────────────
function PayslipCard({ payslip, onDownload, downloading }) {
  return (
    <div className="card hover:border-indigo-500/40 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
            <FileText className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <p className="font-semibold text-white">
              {monthName(payslip.payment_month)} {payslip.payment_year}
            </p>
            <p className="text-xs text-slate-400">
              Generated {new Date(payslip.generated_at).toLocaleDateString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric',
              })}
            </p>
          </div>
        </div>
        <PaymentStatusBadge status={payslip.payment_status} />
      </div>

      {/* Salary breakdown */}
      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Base Salary</span>
          <span className="text-slate-200">{formatCurrency(payslip.base_salary)}</span>
        </div>
        {parseFloat(payslip.hra) > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">HRA</span>
            <span className="text-slate-200">{formatCurrency(payslip.hra)}</span>
          </div>
        )}
        {parseFloat(payslip.allowances) > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Allowances</span>
            <span className="text-slate-200">{formatCurrency(payslip.allowances)}</span>
          </div>
        )}
        {parseFloat(payslip.bonus) > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Bonus</span>
            <span className="text-slate-200">{formatCurrency(payslip.bonus)}</span>
          </div>
        )}
        {(parseFloat(payslip.deductions) > 0 || parseFloat(payslip.tax) > 0) && (
          <>
            <div className="border-t border-slate-700/50 pt-1" />
            {parseFloat(payslip.deductions) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-red-400">Deductions</span>
                <span className="text-red-400">- {formatCurrency(payslip.deductions)}</span>
              </div>
            )}
            {parseFloat(payslip.tax) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-red-400">Tax</span>
                <span className="text-red-400">- {formatCurrency(payslip.tax)}</span>
              </div>
            )}
          </>
        )}
        <div className="border-t border-slate-700/50 pt-2 flex justify-between">
          <span className="font-semibold text-white">Net Salary</span>
          <span className="font-bold text-green-400 text-lg">{formatCurrency(payslip.net_salary)}</span>
        </div>
      </div>

      {/* Payment info */}
      {payslip.payment_date && (
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
          <Calendar className="w-3.5 h-3.5" />
          <span>
            Paid on {new Date(payslip.payment_date).toLocaleDateString('en-IN', {
              day: '2-digit', month: 'short', year: 'numeric',
            })}
            {payslip.payment_method ? ` via ${payslip.payment_method.replace('_', ' ')}` : ''}
          </span>
        </div>
      )}

      {/* Download button */}
      <button
        onClick={() => onDownload(payslip.id)}
        disabled={downloading}
        className="w-full btn-secondary flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Download className="w-4 h-4" />
        {downloading ? 'Downloading...' : 'Download PDF'}
      </button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// PayslipViewer Page
// ══════════════════════════════════════════════════════════════════════════════
export default function PayslipViewer() {
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const isHR = ['founder', 'admin', 'hr'].includes(user?.role)

  // ── Filters ───────────────────────────────────────────────────────────────
  const now = new Date()
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterMonth,    setFilterMonth]    = useState('')
  const [filterYear,     setFilterYear]     = useState('')
  const [search,         setSearch]         = useState('')
  const [downloading,    setDownloading]    = useState(null)

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: employees = [] } = useQuery({
    queryKey: ['employees-minimal'],
    queryFn:  () => import('../../services/api').then(({ employeeService }) =>
      employeeService.list().then((r) => Array.isArray(r.data) ? r.data : r.data?.results ?? [])
    ),
    enabled: isHR,
  })

  const { data: payslips = [], isLoading, refetch } = useQuery({
    queryKey: ['payslips', filterEmployee, filterMonth, filterYear],
    queryFn:  () => payrollService.payslipList({
      ...(filterEmployee && { employee: filterEmployee }),
      ...(filterMonth    && { month:    filterMonth }),
      ...(filterYear     && { year:     filterYear }),
    }).then((r) => Array.isArray(r.data) ? r.data : r.data?.results ?? []),
  })

  // Payments without payslip (HR only — for "Generate" button)
  const { data: payments = [] } = useQuery({
    queryKey: ['payments-no-payslip', filterMonth, filterYear],
    queryFn:  () => payrollService.paymentList({
      ...(filterMonth && { month: filterMonth }),
      ...(filterYear  && { year:  filterYear }),
    }).then((r) => {
      const list = Array.isArray(r.data) ? r.data : r.data?.results ?? []
      return list.filter((p) => !p.has_payslip)
    }),
    enabled: isHR,
  })

  // ── Mutations ─────────────────────────────────────────────────────────────
  const genPayslip = useMutation({
    mutationFn: (paymentId) => payrollService.payslipGenerate({ payment_id: paymentId }),
    onSuccess:  () => {
      qc.invalidateQueries(['payslips'])
      qc.invalidateQueries(['payments-no-payslip'])
      toast.success('Payslip generated')
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed to generate payslip'),
  })

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleDownload = async (id) => {
    setDownloading(id)
    await downloadPayslipPDF(id)
    setDownloading(null)
  }

  // ── Filtered payslips ─────────────────────────────────────────────────────
  const filtered = payslips.filter((ps) => {
    const q = search.toLowerCase()
    if (!q) return true
    return (
      ps.employee_name?.toLowerCase().includes(q) ||
      ps.employee_code?.toLowerCase().includes(q) ||
      ps.department?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
            <FileDown className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">
              {isHR ? 'Payslip Management' : 'My Payslips'}
            </h1>
            <p className="text-sm text-slate-400">
              {isHR ? 'Generate and manage employee payslips' : 'Download your monthly payslips'}
            </p>
          </div>
        </div>

        <button
          onClick={() => refetch()}
          className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400"
          title="Refresh"
        >
          <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {isHR && (
          <>
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employees..."
                className="input-field w-full pl-9"
              />
            </div>

            {/* Employee dropdown */}
            <div className="relative">
              <select
                value={filterEmployee}
                onChange={(e) => setFilterEmployee(e.target.value)}
                className="input-field pr-8 appearance-none"
              >
                <option value="">All Employees</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name} ({e.employee_id})
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </>
        )}

        {/* Month */}
        <div className="relative">
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="input-field pr-8 appearance-none"
          >
            <option value="">All Months</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(0, i).toLocaleString('default', { month: 'long' })}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>

        {/* Year */}
        <div className="relative">
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="input-field pr-8 appearance-none"
          >
            <option value="">All Years</option>
            {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>

        <p className="ml-auto text-xs text-slate-500">
          {filtered.length} payslip{filtered.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* ── HR: Pending payslip generation ─────────────────────────────────── */}
      {isHR && payments.length > 0 && (
        <div className="card border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <p className="text-sm font-medium text-amber-300">
              {payments.length} payment{payments.length !== 1 ? 's' : ''} without a payslip
            </p>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-3 py-2 bg-slate-700/30 rounded-lg">
                <div>
                  <p className="text-sm text-white">{p.employee_name}</p>
                  <p className="text-xs text-slate-400">
                    {monthName(p.month)} {p.year} · {formatCurrency(p.amount_paid)}
                  </p>
                </div>
                <button
                  onClick={() => genPayslip.mutate(p.id)}
                  disabled={genPayslip.isPending}
                  className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <DollarSign className="w-3 h-3" />
                  Generate
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Payslip content ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-slate-700 rounded-xl" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-slate-700 rounded w-3/4" />
                  <div className="h-3 bg-slate-700 rounded w-1/2" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-3 bg-slate-700 rounded" />
                <div className="h-3 bg-slate-700 rounded" />
                <div className="h-3 bg-slate-700 rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-4">
            <FileDown className="w-8 h-8 text-slate-600" />
          </div>
          <h3 className="text-lg font-medium text-slate-300 mb-2">No payslips found</h3>
          <p className="text-sm text-slate-500 max-w-sm">
            {isHR
              ? 'No payslips match your current filters. Generate payslips from the Payroll Dashboard or Salary Management.'
              : 'No payslips yet. Contact HR to generate your payslips.'}
          </p>
        </div>
      ) : isHR ? (
        /* HR view — table */
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  {['Employee', 'Department', 'Period', 'Base', 'Deductions', 'Net Salary', 'Payment Status', 'Generated', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filtered.map((ps) => (
                  <tr key={ps.id} className="hover:bg-slate-700/20 transition-colors">
                    {/* Employee */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-indigo-600/30 rounded-full flex items-center justify-center text-xs text-indigo-300 font-medium flex-shrink-0">
                          {initials(ps.employee_name)}
                        </div>
                        <div>
                          <p className="text-white font-medium">{ps.employee_name}</p>
                          <p className="text-xs text-slate-400">{ps.employee_code}</p>
                        </div>
                      </div>
                    </td>

                    {/* Dept */}
                    <td className="px-4 py-3 text-slate-300">{ps.department || '—'}</td>

                    {/* Period */}
                    <td className="px-4 py-3 text-slate-200 whitespace-nowrap">
                      {monthName(ps.payment_month)} {ps.payment_year}
                    </td>

                    {/* Base */}
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                      {formatCurrency(ps.base_salary)}
                    </td>

                    {/* Deductions */}
                    <td className="px-4 py-3 text-red-400 whitespace-nowrap">
                      {formatCurrency(
                        parseFloat(ps.deductions || 0) + parseFloat(ps.tax || 0)
                      )}
                    </td>

                    {/* Net */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-green-400 font-semibold">{formatCurrency(ps.net_salary)}</span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <PaymentStatusBadge status={ps.payment_status} />
                    </td>

                    {/* Generated */}
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                      {new Date(ps.generated_at).toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </td>

                    {/* Download */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDownload(ps.id)}
                        disabled={downloading === ps.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 rounded-lg transition-colors disabled:opacity-50"
                        title="Download PDF"
                      >
                        {downloading === ps.id
                          ? <RefreshCw className="w-3 h-3 animate-spin" />
                          : <Download className="w-3 h-3" />
                        }
                        PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Employee view — cards */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((ps) => (
            <PayslipCard
              key={ps.id}
              payslip={ps}
              onDownload={handleDownload}
              downloading={downloading === ps.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
