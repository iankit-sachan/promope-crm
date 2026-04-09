import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Landmark, Eye, EyeOff, Shield, Edit2, Plus, Building2, CreditCard, Hash, MapPin, Smartphone, FileText, Clock, CheckCircle, XCircle, AlertTriangle, Upload, Image } from 'lucide-react'
import { payrollService, employeeService } from '../services/api'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/common/LoadingSpinner'

export default function MyBankDetailsPage() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const isHrOrAbove = ['founder', 'admin', 'hr'].includes(user?.role)
  const [editing, setEditing] = useState(false)
  const [showAcct, setShowAcct] = useState(false)
  const [showPan, setShowPan] = useState(false)

  // Fetch only MY bank details (mine=true forces own record even for HR+)
  const { data: bankList = [], isLoading } = useQuery({
    queryKey: ['my-bank-details'],
    queryFn: () => payrollService.bankList({ mine: 'true' }).then((r) =>
      Array.isArray(r.data) ? r.data : r.data?.results ?? []
    ),
  })

  // HR+ users need their employee ID for the create payload
  const { data: myEmployee } = useQuery({
    queryKey: ['my-employee-id'],
    queryFn: () => employeeService.list({ search: user?.email }).then((r) => {
      const list = Array.isArray(r.data) ? r.data : r.data?.results ?? []
      return list.find((e) => e.email === user?.email) || null
    }),
    enabled: isHrOrAbove,
  })

  const record = bankList[0] || null

  const [form, setForm] = useState({
    account_holder_name: '',
    bank_name: '',
    account_number: '',
    ifsc_code: '',
    branch_name: '',
    upi_id: '',
    pan_number: '',
    passbook_photo: null,
  })
  const [photoPreview, setPhotoPreview] = useState(null)

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setForm((p) => ({ ...p, passbook_photo: file }))
      setPhotoPreview(URL.createObjectURL(file))
    }
  }

  // Reset form when entering edit mode
  const startEdit = () => {
    setForm({
      account_holder_name: record?.account_holder_name ?? '',
      bank_name: record?.bank_name ?? '',
      account_number: '',
      ifsc_code: record?.ifsc_code ?? '',
      branch_name: record?.branch_name ?? '',
      upi_id: record?.upi_id ?? '',
      pan_number: '',
      passbook_photo: null,
    })
    setPhotoPreview(null)
    setShowAcct(false)
    setShowPan(false)
    setEditing(true)
  }

  const startCreate = () => {
    setForm({
      account_holder_name: '',
      bank_name: '',
      account_number: '',
      ifsc_code: '',
      branch_name: '',
      upi_id: '',
      pan_number: '',
      passbook_photo: null,
    })
    setPhotoPreview(null)
    setShowAcct(false)
    setShowPan(false)
    setEditing(true)
  }

  const createBank = useMutation({
    mutationFn: (data) => payrollService.bankCreate(data),
    onSuccess: () => {
      qc.invalidateQueries(['my-bank-details'])
      toast.success('Bank details saved successfully')
      setEditing(false)
    },
    onError: (e) => toast.error(e.response?.data?.detail || e.response?.data?.employee?.[0] || 'Failed to save bank details'),
  })

  const updateBank = useMutation({
    mutationFn: ({ id, data }) => payrollService.bankUpdate(id, data),
    onSuccess: () => {
      qc.invalidateQueries(['my-bank-details'])
      toast.success('Bank details updated successfully')
      setEditing(false)
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed to update bank details'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    const hasFile = !!form.passbook_photo

    // Use FormData when file is present, otherwise JSON
    let payload
    if (hasFile) {
      payload = new FormData()
      payload.append('account_holder_name', form.account_holder_name)
      payload.append('bank_name', form.bank_name)
      payload.append('ifsc_code', form.ifsc_code.toUpperCase())
      payload.append('branch_name', form.branch_name)
      payload.append('upi_id', form.upi_id)
      if (form.account_number) payload.append('account_number', form.account_number)
      if (form.pan_number) payload.append('pan_number', form.pan_number)
      payload.append('passbook_photo', form.passbook_photo)
      if (!record && isHrOrAbove && myEmployee) payload.append('employee', myEmployee.id)
    } else {
      payload = {
        account_holder_name: form.account_holder_name,
        bank_name: form.bank_name,
        ifsc_code: form.ifsc_code.toUpperCase(),
        branch_name: form.branch_name,
        upi_id: form.upi_id,
      }
      if (form.account_number) payload.account_number = form.account_number
      if (form.pan_number) payload.pan_number = form.pan_number
      if (!record && isHrOrAbove && myEmployee) payload.employee = myEmployee.id
    }

    if (record) {
      updateBank.mutate({ id: record.id, data: payload })
    } else {
      createBank.mutate(payload)
    }
  }

  const isSaving = createBank.isPending || updateBank.isPending
  const isCreate = !record

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <LoadingSpinner text="Loading bank details..." />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
            <Landmark className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">My Bank Details</h1>
            <p className="text-sm text-slate-400">Manage your bank account information for payroll</p>
          </div>
        </div>
      </div>

      {/* Security notice */}
      <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
        <Shield className="w-5 h-5 text-amber-400 flex-shrink-0" />
        <p className="text-sm text-amber-300">
          Your account number and PAN are securely stored. These details are visible only to HR and above.
          Changes will be notified to HR automatically.
        </p>
      </div>

      {/* Status banners */}
      {!editing && record && record.status === 'pending' && (
        <div className="flex items-center gap-3 px-4 py-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
          <Clock className="w-5 h-5 text-yellow-400 flex-shrink-0" />
          <p className="text-sm text-yellow-300">Your bank details are pending HR approval. You will be notified once reviewed.</p>
        </div>
      )}
      {!editing && record && record.status === 'rejected' && (
        <div className="flex items-start gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-300 font-medium">Your bank details were rejected by HR.</p>
            {record.review_note && <p className="text-sm text-red-300/80 mt-1">Reason: "{record.review_note}"</p>}
            <p className="text-xs text-red-400/60 mt-1">Please update your details and resubmit.</p>
          </div>
        </div>
      )}

      {/* View Mode — everyone sees their own details */}
      {!editing && record && (
        <div className="card space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-slate-700">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-white">Account Information</h2>
              {record.status === 'approved' && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Approved
                </span>
              )}
              {record.status === 'pending' && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Pending Review
                </span>
              )}
              {record.status === 'rejected' && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> Rejected
                </span>
              )}
            </div>
            <button onClick={startEdit} className="btn-primary flex items-center gap-2 text-sm">
              <Edit2 className="w-4 h-4" />
              {record.status === 'rejected' ? 'Resubmit' : 'Edit Details'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <DetailField icon={CreditCard} label="Account Holder" value={record.account_holder_name} />
            <DetailField icon={Building2} label="Bank Name" value={record.bank_name} />
            <DetailField icon={Hash} label="Account Number" value={record.account_number_display} mono />
            <DetailField icon={Hash} label="IFSC Code" value={record.ifsc_code} mono />
            <DetailField icon={MapPin} label="Branch" value={record.branch_name || '—'} />
            <DetailField icon={Smartphone} label="UPI ID" value={record.upi_id || '—'} />
            <DetailField icon={FileText} label="PAN Number" value={record.pan_number_display || '—'} mono />
            <DetailField icon={CreditCard} label="Last Updated" value={
              new Date(record.updated_at).toLocaleDateString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric',
              })
            } />
          </div>

          {record.passbook_photo_url && (
            <div className="pt-4 border-t border-slate-700">
              <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-2">Passbook Photo</p>
              <a href={record.passbook_photo_url} target="_blank" rel="noopener noreferrer">
                <img src={record.passbook_photo_url} alt="Passbook"
                  className="max-w-[200px] rounded-lg border border-slate-600 hover:border-indigo-500 transition-colors cursor-pointer" />
              </a>
            </div>
          )}
        </div>
      )}

      {/* Empty State — no record yet */}
      {!editing && !record && (
        <div className="card flex flex-col items-center justify-center py-12">
          <Landmark className="w-12 h-12 text-slate-600 mb-4" />
          <h3 className="text-lg font-semibold text-slate-300 mb-1">No Bank Details Added</h3>
          <p className="text-sm text-slate-500 mb-6 text-center max-w-sm">
            Add your bank account details so that HR can process your payroll seamlessly.
          </p>
          {isHrOrAbove && !myEmployee ? (
            <p className="text-sm text-amber-400">Your account does not have an employee profile. Please contact admin.</p>
          ) : (
            <button onClick={startCreate} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add Bank Details
            </button>
          )}
        </div>
      )}

      {/* Edit / Create Form */}
      {editing && (
        <form onSubmit={handleSubmit} className="card space-y-5">
          <div className="pb-4 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-white">
              {isCreate ? 'Add Bank Details' : 'Edit Bank Details'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {isCreate ? 'Enter your bank account information below.' : 'Update your bank account information. Leave sensitive fields blank to keep existing values.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Account Holder Name *</label>
              <input
                type="text"
                value={form.account_holder_name}
                onChange={(e) => setForm((p) => ({ ...p, account_holder_name: e.target.value }))}
                className="input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Bank Name *</label>
              <input
                type="text"
                value={form.bank_name}
                onChange={(e) => setForm((p) => ({ ...p, bank_name: e.target.value }))}
                className="input w-full"
                required
              />
            </div>
          </div>

          {/* Account number */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Account Number {isCreate ? '*' : '(enter new to update)'}
            </label>
            <div className="relative">
              <input
                type={showAcct ? 'text' : 'password'}
                value={form.account_number}
                onChange={(e) => setForm((p) => ({ ...p, account_number: e.target.value }))}
                className="input w-full pr-10"
                placeholder={isCreate ? 'Enter account number' : 'Leave blank to keep existing'}
                maxLength={30}
                required={isCreate}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">IFSC Code *</label>
              <input
                type="text"
                value={form.ifsc_code}
                onChange={(e) => setForm((p) => ({ ...p, ifsc_code: e.target.value }))}
                className="input w-full"
                placeholder="e.g. SBIN0001234"
                maxLength={11}
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Branch Name</label>
              <input
                type="text"
                value={form.branch_name}
                onChange={(e) => setForm((p) => ({ ...p, branch_name: e.target.value }))}
                className="input w-full"
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">UPI ID</label>
              <input
                type="text"
                value={form.upi_id}
                onChange={(e) => setForm((p) => ({ ...p, upi_id: e.target.value }))}
                className="input w-full"
                placeholder="name@upi (optional)"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                PAN Number {isCreate ? '(optional)' : '(enter new to update)'}
              </label>
              <div className="relative">
                <input
                  type={showPan ? 'text' : 'password'}
                  value={form.pan_number}
                  onChange={(e) => setForm((p) => ({ ...p, pan_number: e.target.value.toUpperCase() }))}
                  className="input w-full pr-10"
                  placeholder={isCreate ? 'e.g. ABCDE1234F' : 'Leave blank to keep existing'}
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
          </div>

          {/* Passbook photo upload */}
          <div>
            <p className="text-xs text-slate-400 mb-1">Passbook / Cheque Photo (optional)</p>
            <div className="flex items-start gap-4">
              <button type="button"
                onClick={() => document.getElementById('passbook-file-input')?.click()}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors">
                <Upload className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-300">{form.passbook_photo ? form.passbook_photo.name : 'Upload photo'}</span>
              </button>
              <input id="passbook-file-input" type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
              {(photoPreview || record?.passbook_photo_url) && (
                <img
                  src={photoPreview || record?.passbook_photo_url}
                  alt="Passbook"
                  className="w-16 h-16 object-cover rounded-lg border border-slate-600"
                />
              )}
            </div>
          </div>

          {/* Security note */}
          <div className="flex items-start gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <Shield className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">
              Sensitive fields (account number, PAN) are encrypted at rest and visible only to HR and above.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setEditing(false)} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || (isCreate && (!form.account_holder_name || !form.bank_name || !form.account_number || !form.ifsc_code))}
              className="btn-primary disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : isCreate ? 'Save Bank Details' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function DetailField({ icon: Icon, label, value, mono }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 bg-slate-700/50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-slate-400" />
      </div>
      <div>
        <p className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</p>
        <p className={`text-sm text-slate-200 ${mono ? 'font-mono' : ''}`}>{value}</p>
      </div>
    </div>
  )
}
