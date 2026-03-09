import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CreditCard, Search, Plus, Edit2, X, ChevronDown,
  Eye, EyeOff, Shield,
} from 'lucide-react'
import { payrollService, departmentService } from '../../services/api'
import { initials } from '../../utils/helpers'
import toast from 'react-hot-toast'

// ── Bank Details Modal (Add / Edit) ─────────────────────────────────────────
function BankDetailsModal({ onClose, onSave, initial = null, employees = [] }) {
  const isEdit = !!initial
  const [form, setForm] = useState({
    employee:             initial?.employee ?? '',
    account_holder_name:  initial?.account_holder_name ?? '',
    bank_name:            initial?.bank_name ?? '',
    account_number:       '',  // always empty on edit (write-only field)
    ifsc_code:            initial?.ifsc_code ?? '',
    branch_name:          initial?.branch_name ?? '',
    upi_id:               initial?.upi_id ?? '',
    pan_number:           '',  // always empty on edit (write-only field)
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
        className="input-field w-full"
        placeholder={opts.placeholder || ''}
        required={opts.required}
        maxLength={opts.maxLength}
      />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">
            {isEdit ? 'Edit Bank Details' : 'Add Bank Details'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Employee selector (create only) */}
          {!isEdit ? (
            <div>
              <label className="block text-xs text-slate-400 mb-1">Employee *</label>
              <select
                value={form.employee}
                onChange={(e) => setForm((p) => ({ ...p, employee: e.target.value }))}
                className="input-field w-full"
              >
                <option value="">Select employee</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name} ({e.employee_id})
                  </option>
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

          {/* Account number (always re-enter on edit for security) */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Account Number {isEdit ? '(enter new to update)' : '*'}
            </label>
            <div className="relative">
              <input
                type={showAcct ? 'text' : 'password'}
                value={form.account_number}
                onChange={(e) => setForm((p) => ({ ...p, account_number: e.target.value }))}
                className="input-field w-full pr-10"
                placeholder={isEdit ? 'Leave blank to keep existing' : 'Enter account number'}
                maxLength={30}
              />
              <button
                type="button"
                onClick={() => setShowAcct(!showAcct)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {showAcct ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {field('IFSC Code *', 'ifsc_code', { required: true, maxLength: 11, placeholder: 'e.g. SBIN0001234' })}
          {field('Branch Name', 'branch_name', { placeholder: 'Optional' })}
          {field('UPI ID', 'upi_id', { placeholder: 'name@upi (optional)' })}

          {/* PAN number */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              PAN Number {isEdit ? '(enter new to update)' : '(optional)'}
            </label>
            <div className="relative">
              <input
                type={showPan ? 'text' : 'password'}
                value={form.pan_number}
                onChange={(e) => setForm((p) => ({ ...p, pan_number: e.target.value.toUpperCase() }))}
                className="input-field w-full pr-10"
                placeholder={isEdit ? 'Leave blank to keep existing' : 'e.g. ABCDE1234F'}
                maxLength={10}
              />
              <button
                type="button"
                onClick={() => setShowPan(!showPan)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {showPan ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Security note */}
          <div className="flex items-start gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <Shield className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">
              Sensitive fields (account number, PAN) are encrypted at rest and visible only to HR and above.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-700">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={() => onSave(form)}
            disabled={!isEdit && (!form.employee || !form.account_holder_name || !form.bank_name || !form.account_number || !form.ifsc_code)}
            className="btn-primary disabled:opacity-50"
          >
            {isEdit ? 'Save Changes' : 'Add Bank Details'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// EmployeeBankDetailsPage
// ══════════════════════════════════════════════════════════════════════════════
export default function EmployeeBankDetailsPage() {
  const qc = useQueryClient()
  const [search, setSearch]     = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [modalTarget, setModalTarget] = useState(null)   // null = closed; false = create; obj = edit
  const [revealRow, setRevealRow]     = useState(null)   // id of row with revealed account

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: depts = [] } = useQuery({
    queryKey: ['departments'],
    queryFn:  () => departmentService.list().then((r) => Array.isArray(r.data) ? r.data : r.data?.results ?? []),
  })

  const { data: bankList = [], isLoading } = useQuery({
    queryKey: ['bank-details', deptFilter],
    queryFn:  () => payrollService.bankList(
      deptFilter ? { department: deptFilter } : {}
    ).then((r) => Array.isArray(r.data) ? r.data : r.data?.results ?? []),
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
    onSuccess:  () => {
      qc.invalidateQueries(['bank-details'])
      toast.success('Bank details added')
      setModalTarget(null)
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed to add bank details'),
  })

  const updateBank = useMutation({
    mutationFn: ({ id, data }) => payrollService.bankUpdate(id, data),
    onSuccess:  () => {
      qc.invalidateQueries(['bank-details'])
      toast.success('Bank details updated')
      setModalTarget(null)
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed to update'),
  })

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = bankList.filter((b) => {
    const q = search.toLowerCase()
    return !q || b.employee_name?.toLowerCase().includes(q) || b.employee_code?.toLowerCase().includes(q)
  })

  // ── Save handler ──────────────────────────────────────────────────────────
  const handleSave = (form) => {
    const isEdit = modalTarget && typeof modalTarget === 'object' && modalTarget.id

    const payload = {
      account_holder_name: form.account_holder_name,
      bank_name:           form.bank_name,
      ifsc_code:           form.ifsc_code.toUpperCase(),
      branch_name:         form.branch_name,
      upi_id:              form.upi_id,
    }
    // Only include sensitive fields if provided
    if (form.account_number) payload.account_number = form.account_number
    if (form.pan_number)     payload.pan_number     = form.pan_number

    if (isEdit) {
      updateBank.mutate({ id: modalTarget.id, data: payload })
    } else {
      createBank.mutate({ ...payload, employee: parseInt(form.employee), account_number: form.account_number })
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
        </div>

        <button
          onClick={() => setModalTarget(false)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Bank Details
        </button>
      </div>

      {/* Security notice */}
      <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
        <Shield className="w-5 h-5 text-amber-400 flex-shrink-0" />
        <p className="text-sm text-amber-300">
          Account numbers and PAN numbers are masked for security. Full details are visible only to HR and above.
          All sensitive data is write-only — existing values cannot be read back through the API.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
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

        {/* Department filter */}
        <div className="relative">
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="input-field pr-8 appearance-none"
          >
            <option value="">All Departments</option>
            {depts.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
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
                {['Employee', 'Department', 'Bank Name', 'Account Number', 'IFSC Code', 'UPI ID', 'PAN Number', 'Last Updated', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">Loading...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center">
                    <CreditCard className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-500">No bank details found</p>
                    <p className="text-xs text-slate-600 mt-1">Add bank details for employees to enable payroll processing</p>
                  </td>
                </tr>
              ) : (
                filtered.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-700/20 transition-colors">
                    {/* Employee */}
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

                    {/* Department */}
                    <td className="px-4 py-3 text-slate-300">{b.department || '—'}</td>

                    {/* Bank Name */}
                    <td className="px-4 py-3 text-slate-200 whitespace-nowrap">{b.bank_name}</td>

                    {/* Account Number (masked / revealed) */}
                    <td className="px-4 py-3 font-mono text-slate-300 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span>{b.account_number_display}</span>
                        <button
                          onClick={() => setRevealRow(revealRow === b.id ? null : b.id)}
                          className="p-0.5 hover:text-indigo-400 text-slate-500 transition-colors"
                          title={revealRow === b.id ? 'Hide' : 'Toggle view'}
                        >
                          {revealRow === b.id
                            ? <EyeOff className="w-3.5 h-3.5" />
                            : <Eye className="w-3.5 h-3.5" />
                          }
                        </button>
                      </div>
                    </td>

                    {/* IFSC */}
                    <td className="px-4 py-3 font-mono text-slate-300 whitespace-nowrap">{b.ifsc_code}</td>

                    {/* UPI */}
                    <td className="px-4 py-3 text-slate-400">{b.upi_id || '—'}</td>

                    {/* PAN */}
                    <td className="px-4 py-3 font-mono text-slate-400">
                      {b.pan_number_display || '—'}
                    </td>

                    {/* Updated */}
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                      {new Date(b.updated_at).toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setModalTarget(b)}
                        className="p-1.5 hover:bg-indigo-500/20 rounded-lg transition-colors text-slate-400 hover:text-indigo-400"
                        title="Edit bank details"
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

      {/* Modal */}
      {modalTarget !== null && (
        <BankDetailsModal
          onClose={() => setModalTarget(null)}
          onSave={handleSave}
          initial={typeof modalTarget === 'object' && modalTarget ? modalTarget : null}
          employees={employees}
        />
      )}
    </div>
  )
}
