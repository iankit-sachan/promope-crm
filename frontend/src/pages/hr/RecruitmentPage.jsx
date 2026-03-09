import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Briefcase, Plus, X, ChevronRight, Users, Edit,
} from 'lucide-react'
import { hrService, departmentService } from '../../services/api'
import { formatDate } from '../../utils/helpers'
import clsx from 'clsx'
import toast from 'react-hot-toast'

const POSITION_STATUSES = ['open', 'hold', 'closed']
const APPLICANT_STATUSES = ['applied', 'screening', 'interview', 'offered', 'hired', 'rejected']

function PositionStatusBadge({ status }) {
  return <span className={`recruit-${status}`}>{status}</span>
}

function ApplicantStatusBadge({ status }) {
  return (
    <span className={`applicant-${status}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

// ── Create position modal ─────────────────────────────────────────────────────
function CreatePositionModal({ departments, onClose, onSave }) {
  const [form, setForm] = useState({
    title: '', department: '', description: '', openings: 1, status: 'open',
  })

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md fade-in">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h3 className="font-semibold">New Position</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Job Title *</label>
            <input
              type="text"
              className="input w-full"
              placeholder="e.g. Frontend Developer"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Department</label>
              <select
                className="input w-full"
                value={form.department}
                onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
              >
                <option value="">None</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Openings</label>
              <input
                type="number"
                className="input w-full"
                min={1}
                value={form.openings}
                onChange={e => setForm(f => ({ ...f, openings: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Description</label>
            <textarea
              className="input w-full resize-none"
              rows={3}
              placeholder="Role description, requirements..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-slate-700">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button
            onClick={() => form.title.trim() && onSave(form)}
            className="btn-primary"
          >
            Create Position
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add applicant modal ────────────────────────────────────────────────────────
function AddApplicantModal({ positionId, onClose, onSave }) {
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', status: 'applied',
  })

  const handleSubmit = () => {
    if (!form.full_name.trim() || !form.email.trim()) {
      toast.error('Name and email are required')
      return
    }
    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => fd.append(k, v))
    onSave(fd)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md fade-in">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h3 className="font-semibold">Add Applicant</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {[
            { name: 'full_name', label: 'Full Name *', type: 'text' },
            { name: 'email',     label: 'Email *',     type: 'email' },
            { name: 'phone',     label: 'Phone',       type: 'text' },
          ].map(({ name, label, type }) => (
            <div key={name}>
              <label className="text-xs text-slate-400 mb-1 block">{label}</label>
              <input
                type={type}
                className="input w-full"
                value={form[name]}
                onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-slate-700">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleSubmit} className="btn-primary">Add</button>
        </div>
      </div>
    </div>
  )
}

// ── Applicant detail drawer ────────────────────────────────────────────────────
function ApplicantDrawer({ applicant, onClose, onUpdate }) {
  const [status, setStatus] = useState(applicant.status)
  const [notes,  setNotes]  = useState(applicant.interview_notes || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onUpdate(applicant.id, { status, interview_notes: notes })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end">
      <div className="w-full max-w-md bg-slate-800 border-l border-slate-700 h-full flex flex-col fade-in">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h3 className="font-semibold">Applicant Details</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="space-y-1">
            <h4 className="text-lg font-semibold text-white">{applicant.full_name}</h4>
            <p className="text-slate-400 text-sm">{applicant.email}</p>
            {applicant.phone && <p className="text-slate-400 text-sm">{applicant.phone}</p>}
            <p className="text-xs text-slate-500">Applied: {formatDate(applicant.applied_at)}</p>
          </div>

          {applicant.resume_url && (
            <a
              href={applicant.resume_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 text-sm"
            >
              📄 View Resume
            </a>
          )}

          <div>
            <label className="text-xs text-slate-400 mb-2 block">Status</label>
            <select
              className="input w-full"
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              {APPLICANT_STATUSES.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-2 block">Interview Notes</label>
            <textarea
              className="input w-full min-h-[120px] resize-none"
              placeholder="Notes about interviews, assessments..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>
        <div className="p-5 border-t border-slate-700">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary w-full"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function RecruitmentPage() {
  const [selectedPos, setSelectedPos] = useState(null)
  const [showCreate,  setShowCreate]  = useState(false)
  const [showAddApplicant, setShowAddApplicant] = useState(false)
  const [selectedApplicant, setSelectedApplicant] = useState(null)
  const qc = useQueryClient()

  const { data: deptData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentService.list().then(r => r.data),
  })
  const { data: posData, isLoading: posLoading } = useQuery({
    queryKey: ['recruitment-positions'],
    queryFn: () => hrService.positionList().then(r => r.data),
  })
  const { data: appData, isLoading: appLoading } = useQuery({
    queryKey: ['applicants', selectedPos?.id],
    queryFn: () => hrService.applicantList(selectedPos.id).then(r => r.data),
    enabled: !!selectedPos,
  })

  const departments = deptData?.results || deptData || []
  const positions   = posData?.results  || posData  || []
  const applicants  = appData?.results  || appData  || []

  const createPosMutation = useMutation({
    mutationFn: (data) => hrService.positionCreate(data),
    onSuccess: () => {
      toast.success('Position created')
      setShowCreate(false)
      qc.invalidateQueries({ queryKey: ['recruitment-positions'] })
    },
  })

  const addApplicantMutation = useMutation({
    mutationFn: (fd) => hrService.applicantCreate(selectedPos.id, fd),
    onSuccess: () => {
      toast.success('Applicant added')
      setShowAddApplicant(false)
      qc.invalidateQueries({ queryKey: ['applicants', selectedPos?.id] })
    },
  })

  const updateApplicantMutation = useMutation({
    mutationFn: ({ id, data }) => hrService.applicantUpdate(id, data),
    onSuccess: () => {
      toast.success('Applicant updated')
      setSelectedApplicant(null)
      qc.invalidateQueries({ queryKey: ['applicants', selectedPos?.id] })
    },
  })

  const updatePosMutation = useMutation({
    mutationFn: ({ id, data }) => hrService.positionUpdate(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recruitment-positions'] })
    },
  })

  // Group applicants by status
  const pipeline = APPLICANT_STATUSES.reduce((acc, s) => {
    acc[s] = applicants.filter(a => a.status === s)
    return acc
  }, {})

  const STATUS_COLORS = {
    applied:   'border-indigo-500/30 bg-indigo-500/5',
    screening: 'border-blue-500/30 bg-blue-500/5',
    interview: 'border-purple-500/30 bg-purple-500/5',
    offered:   'border-yellow-500/30 bg-yellow-500/5',
    hired:     'border-green-500/30 bg-green-500/5',
    rejected:  'border-red-500/30 bg-red-500/5',
  }

  return (
    <div className="space-y-6 h-full">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Recruitment</h1>
          <p className="text-slate-400 text-sm mt-1">Manage job openings and applicant pipeline</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Position
        </button>
      </div>

      <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[400px]">
        {/* Left: Positions list */}
        <div className="w-64 flex-shrink-0 overflow-y-auto space-y-2">
          {posLoading ? (
            <p className="text-slate-500 text-sm text-center py-4">Loading...</p>
          ) : positions.length === 0 ? (
            <div className="card text-center py-8">
              <Briefcase className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">No positions yet</p>
            </div>
          ) : (
            positions.map(pos => (
              <button
                key={pos.id}
                onClick={() => setSelectedPos(pos)}
                className={clsx(
                  'w-full text-left p-3 rounded-xl border transition-all',
                  selectedPos?.id === pos.id
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-slate-200 truncate">{pos.title}</p>
                  <ChevronRight className="w-3 h-3 text-slate-500 flex-shrink-0" />
                </div>
                <p className="text-xs text-slate-500">{pos.department_name || 'No dept'}</p>
                <div className="flex items-center justify-between mt-2">
                  <PositionStatusBadge status={pos.status} />
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <Users className="w-3 h-3" />
                    {pos.applicant_count}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Right: Pipeline */}
        {!selectedPos ? (
          <div className="flex-1 card flex items-center justify-center">
            <div className="text-center">
              <Briefcase className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">Select a position to view the applicant pipeline</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col gap-3">
            {/* Position header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">{selectedPos.title}</h2>
                <p className="text-slate-400 text-sm">
                  {selectedPos.department_name || 'No department'} ·{' '}
                  {selectedPos.openings} opening{selectedPos.openings !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="input text-sm"
                  value={selectedPos.status}
                  onChange={e => {
                    updatePosMutation.mutate({ id: selectedPos.id, data: { status: e.target.value } })
                    setSelectedPos(p => ({ ...p, status: e.target.value }))
                  }}
                >
                  {POSITION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button
                  onClick={() => setShowAddApplicant(true)}
                  className="btn-primary text-sm flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Applicant
                </button>
              </div>
            </div>

            {/* Kanban columns */}
            {appLoading ? (
              <div className="text-center py-8 text-slate-500">Loading applicants...</div>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2 flex-1">
                {APPLICANT_STATUSES.map(s => (
                  <div
                    key={s}
                    className={clsx(
                      'flex-shrink-0 w-44 rounded-xl border p-3 space-y-2 overflow-y-auto',
                      STATUS_COLORS[s]
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-300 capitalize">{s}</span>
                      <span className="text-xs text-slate-500 bg-slate-700/60 rounded-full px-1.5">
                        {pipeline[s].length}
                      </span>
                    </div>
                    {pipeline[s].map(app => (
                      <button
                        key={app.id}
                        onClick={() => setSelectedApplicant(app)}
                        className="w-full text-left p-2.5 bg-slate-800 border border-slate-700 rounded-lg hover:border-slate-500 transition-colors"
                      >
                        <p className="text-xs font-medium text-slate-200 truncate">{app.full_name}</p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">{app.email}</p>
                        <p className="text-xs text-slate-600 mt-1">{formatDate(app.applied_at)}</p>
                      </button>
                    ))}
                    {pipeline[s].length === 0 && (
                      <p className="text-xs text-slate-600 text-center py-3">—</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <CreatePositionModal
          departments={departments}
          onClose={() => setShowCreate(false)}
          onSave={(data) => createPosMutation.mutate(data)}
        />
      )}
      {showAddApplicant && selectedPos && (
        <AddApplicantModal
          positionId={selectedPos.id}
          onClose={() => setShowAddApplicant(false)}
          onSave={(fd) => addApplicantMutation.mutate(fd)}
        />
      )}
      {selectedApplicant && (
        <ApplicantDrawer
          applicant={selectedApplicant}
          onClose={() => setSelectedApplicant(null)}
          onUpdate={(id, data) => updateApplicantMutation.mutate({ id, data })}
        />
      )}
    </div>
  )
}
