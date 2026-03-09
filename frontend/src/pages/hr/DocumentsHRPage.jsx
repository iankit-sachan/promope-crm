import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, FileText, Check, X, Eye, Search } from 'lucide-react'
import { hrService, employeeService } from '../../services/api'
import { formatDate } from '../../utils/helpers'
import clsx from 'clsx'
import toast from 'react-hot-toast'

const DOC_TYPE_LABELS = {
  id_proof: 'ID Proof', contract: 'Contract',
  certificate: 'Certificate', other: 'Other',
}

function DocTypeBadge({ type }) {
  const cls = `doc-${type}` || 'badge bg-slate-500/10 text-slate-400'
  return <span className={cls}>{DOC_TYPE_LABELS[type] || type}</span>
}
function StatusBadge({ status }) {
  return <span className={`status-${status}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
}

// ── Upload modal ──────────────────────────────────────────────────────────────
function UploadModal({ employees, onClose, onSave }) {
  const [form, setForm] = useState({
    employee: '', doc_type: 'id_proof', title: '', file: null,
  })
  const fileRef = useRef()

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.employee || !form.title || !form.file) {
      toast.error('Fill in all required fields')
      return
    }
    const fd = new FormData()
    fd.append('employee', form.employee)
    fd.append('doc_type', form.doc_type)
    fd.append('title',    form.title)
    fd.append('file',     form.file)
    onSave(fd)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md fade-in">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h3 className="font-semibold text-slate-200">Upload Document</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Employee *</label>
            <select
              className="input w-full"
              value={form.employee}
              onChange={e => setForm(f => ({ ...f, employee: e.target.value }))}
            >
              <option value="">Select employee</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.full_name} ({emp.employee_id})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Document Type</label>
            <select
              className="input w-full"
              value={form.doc_type}
              onChange={e => setForm(f => ({ ...f, doc_type: e.target.value }))}
            >
              {Object.entries(DOC_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Title *</label>
            <input
              type="text"
              className="input w-full"
              placeholder="e.g. Aadhar Card, Offer Letter..."
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">File * (PDF, JPG, PNG, DOCX)</label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.docx"
              className="hidden"
              onChange={e => setForm(f => ({ ...f, file: e.target.files[0] }))}
            />
            <button
              type="button"
              onClick={() => fileRef.current.click()}
              className="input w-full text-left text-slate-400 flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              {form.file ? form.file.name : 'Choose file...'}
            </button>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" className="btn-primary">Upload</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Review modal ──────────────────────────────────────────────────────────────
function ReviewModal({ doc, onClose, onSave }) {
  const [newStatus, setNewStatus] = useState('approved')
  const [notes, setNotes] = useState('')

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md fade-in">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h3 className="font-semibold text-slate-200">Review Document</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-400">
            Document: <span className="text-slate-200 font-medium">{doc?.title}</span><br />
            Employee: <span className="text-slate-200">{doc?.employee_name}</span>
          </p>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Decision</label>
            <div className="flex gap-3">
              {['approved', 'rejected'].map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setNewStatus(s)}
                  className={clsx(
                    'px-4 py-2 rounded-lg text-sm font-medium border transition-all',
                    newStatus === s
                      ? s === 'approved'
                        ? 'bg-green-600 border-green-600 text-white'
                        : 'bg-red-600 border-red-600 text-white'
                      : 'border-slate-600 text-slate-400 hover:border-slate-500'
                  )}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Review Notes (optional)</label>
            <textarea
              className="input w-full resize-none"
              rows={3}
              placeholder="Additional notes..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-slate-700">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button
            onClick={() => onSave({ status: newStatus, review_notes: notes })}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              newStatus === 'approved'
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
            )}
          >
            Submit Review
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DocumentsHRPage() {
  const [showUpload, setShowUpload] = useState(false)
  const [reviewTarget, setReviewTarget] = useState(null)
  const [filters, setFilters] = useState({ status: '', doc_type: '' })
  const qc = useQueryClient()

  const { data: docsData, isLoading } = useQuery({
    queryKey: ['hr-documents', filters],
    queryFn: () => hrService.documentList({
      ...(filters.status   && { status: filters.status }),
      ...(filters.doc_type && { doc_type: filters.doc_type }),
    }).then(r => r.data),
  })

  const { data: empData } = useQuery({
    queryKey: ['employees-minimal'],
    queryFn: () => employeeService.list({ page_size: 200 }).then(r => r.data),
  })

  const uploadMutation = useMutation({
    mutationFn: (fd) => hrService.documentUpload(fd),
    onSuccess: () => {
      toast.success('Document uploaded')
      setShowUpload(false)
      qc.invalidateQueries({ queryKey: ['hr-documents'] })
    },
    onError: () => toast.error('Upload failed'),
  })

  const reviewMutation = useMutation({
    mutationFn: ({ id, data }) => hrService.documentReview(id, data),
    onSuccess: () => {
      toast.success('Review saved')
      setReviewTarget(null)
      qc.invalidateQueries({ queryKey: ['hr-documents'] })
    },
    onError: () => toast.error('Review failed'),
  })

  const docs      = docsData?.results || docsData || []
  const employees = empData?.results  || empData  || []

  const formatSize = (bytes) => {
    if (!bytes) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">HR Documents</h1>
          <p className="text-slate-400 text-sm mt-1">Employee documents — ID proofs, contracts, certificates</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          Upload Document
        </button>
      </div>

      {/* Filters */}
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
        </select>
        <select
          className="input text-sm"
          value={filters.doc_type}
          onChange={e => setFilters(f => ({ ...f, doc_type: e.target.value }))}
        >
          <option value="">All Types</option>
          {Object.entries(DOC_TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : docs.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500">No documents found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-700">
                <tr>
                  {['Employee','Type','Title','Size','Status','Uploaded By','Date','Actions'].map(h => (
                    <th key={h} className="th text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {docs.map(doc => (
                  <tr key={doc.id} className="table-row">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-200">{doc.employee_name}</p>
                      <p className="text-xs text-slate-500">{doc.employee_code}</p>
                    </td>
                    <td className="px-4 py-3"><DocTypeBadge type={doc.doc_type} /></td>
                    <td className="px-4 py-3 text-sm text-slate-300 max-w-[140px] truncate">{doc.title}</td>
                    <td className="px-4 py-3 text-sm text-slate-400">{formatSize(doc.file_size)}</td>
                    <td className="px-4 py-3"><StatusBadge status={doc.status} /></td>
                    <td className="px-4 py-3 text-xs text-slate-400">{doc.uploaded_by_name || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{formatDate(doc.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {doc.file_url && (
                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-700 rounded-lg"
                            title="View"
                          >
                            <Eye className="w-4 h-4" />
                          </a>
                        )}
                        {doc.status === 'pending' && (
                          <button
                            onClick={() => setReviewTarget(doc)}
                            className="p-1.5 text-slate-400 hover:text-green-400 hover:bg-slate-700 rounded-lg"
                            title="Review"
                          >
                            <Check className="w-4 h-4" />
                          </button>
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

      {showUpload && (
        <UploadModal
          employees={employees}
          onClose={() => setShowUpload(false)}
          onSave={(fd) => uploadMutation.mutate(fd)}
        />
      )}
      {reviewTarget && (
        <ReviewModal
          doc={reviewTarget}
          onClose={() => setReviewTarget(null)}
          onSave={(data) => reviewMutation.mutate({ id: reviewTarget.id, data })}
        />
      )}
    </div>
  )
}
