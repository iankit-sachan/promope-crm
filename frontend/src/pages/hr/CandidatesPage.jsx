import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, X, Search, UserSearch, Star, ChevronRight } from 'lucide-react'
import { hiringService } from '../../services/api'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const STAGES = [
  { value: '',              label: 'All Stages' },
  { value: 'applied',        label: 'Applied' },
  { value: 'screening',      label: 'Screening' },
  { value: 'interview',      label: 'Interview' },
  { value: 'technical_test', label: 'Technical Test' },
  { value: 'final_round',    label: 'Final Round' },
  { value: 'offer_sent',     label: 'Offer Sent' },
  { value: 'hired',          label: 'Hired' },
  { value: 'rejected',       label: 'Rejected' },
]

const stageStyle = {
  applied:        'bg-indigo-500/15 text-indigo-400',
  screening:      'bg-purple-500/15 text-purple-400',
  interview:      'bg-blue-500/15 text-blue-400',
  technical_test: 'bg-cyan-500/15 text-cyan-400',
  final_round:    'bg-amber-500/15 text-amber-400',
  offer_sent:     'bg-orange-500/15 text-orange-400',
  hired:          'bg-green-500/15 text-green-400',
  rejected:       'bg-red-500/15 text-red-400',
}

function StageBadge({ stage }) {
  return (
    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium capitalize', stageStyle[stage])}>
      {stage?.replace('_', ' ')}
    </span>
  )
}

function StarRating({ value }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={clsx('w-3 h-3', i <= value ? 'text-amber-400 fill-amber-400' : 'text-slate-600')}
        />
      ))}
    </div>
  )
}

function AddCandidateModal({ jobs, onClose, onSave, isSaving }) {
  const qc = useQueryClient()
  const [form, setForm]   = useState({ candidate_name: '', email: '', phone: '',
    applied_position: '', linkedin_profile: '', portfolio_link: '', notes: '' })
  const [resume, setResume] = useState(null)
  const [showNewJob, setShowNewJob] = useState(false)
  const [newJobTitle, setNewJobTitle] = useState('')

  const createJobMutation = useMutation({
    mutationFn: (title) => hiringService.jobCreate({ job_title: title, job_description: title, job_status: 'open' }),
    onSuccess: (res) => {
      const newJob = res.data
      qc.invalidateQueries({ queryKey: ['hiring-jobs'] })
      setForm(f => ({ ...f, applied_position: String(newJob.id) }))
      setNewJobTitle('')
      setShowNewJob(false)
      toast.success(`Job "${newJob.job_title}" created`)
    },
    onError: (err) => toast.error(err.response?.data?.job_title?.[0] || 'Failed to create job'),
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = () => {
    if (!form.candidate_name.trim() || !form.email.trim()) {
      toast.error('Name and email are required')
      return
    }
    // C1: validate file type before upload
    if (resume) {
      const allowed = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ]
      if (!allowed.includes(resume.type)) {
        toast.error('Resume must be a PDF or Word document')
        return
      }
    }
    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => v && fd.append(k, v))
    if (resume) fd.append('resume_file', resume)
    onSave(fd)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg fade-in">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h3 className="font-semibold text-white">Add Candidate</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Full Name *</label>
              <input className="input w-full" value={form.candidate_name}
                onChange={e => set('candidate_name', e.target.value)} />
            </div>
            <div>
              <label className="label">Email *</label>
              <input type="email" className="input w-full" value={form.email}
                onChange={e => set('email', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Phone</label>
              <input className="input w-full" value={form.phone}
                onChange={e => set('phone', e.target.value)} />
            </div>
            <div>
              <label className="label">Applied Position</label>
              {!showNewJob ? (
                <select className="input w-full" value={form.applied_position}
                  onChange={e => {
                    if (e.target.value === '__new__') { setShowNewJob(true) }
                    else { set('applied_position', e.target.value) }
                  }}>
                  <option value="">— Select job —</option>
                  <option value="__new__">+ Create New Job</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.job_title}</option>)}
                </select>
              ) : (
                <div className="flex items-center gap-2">
                  <input className="input flex-1" placeholder="Job title" value={newJobTitle}
                    onChange={e => setNewJobTitle(e.target.value)} autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); if (newJobTitle.trim()) createJobMutation.mutate(newJobTitle.trim()) }
                      if (e.key === 'Escape') setShowNewJob(false)
                    }} />
                  <button type="button" disabled={!newJobTitle.trim() || createJobMutation.isPending}
                    onClick={() => newJobTitle.trim() && createJobMutation.mutate(newJobTitle.trim())}
                    className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-50">
                    <Plus className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => { setShowNewJob(false); setNewJobTitle('') }}
                    className="p-2 hover:bg-slate-700 text-slate-400 rounded-lg">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="label">LinkedIn Profile</label>
            <input className="input w-full" placeholder="https://linkedin.com/in/..." value={form.linkedin_profile}
              onChange={e => set('linkedin_profile', e.target.value)} />
          </div>
          <div>
            <label className="label">Portfolio Link</label>
            <input className="input w-full" placeholder="https://..." value={form.portfolio_link}
              onChange={e => set('portfolio_link', e.target.value)} />
          </div>
          <div>
            <label className="label">Resume (PDF)</label>
            <input
              type="file" accept=".pdf,.doc,.docx"
              className="block w-full text-sm text-slate-400
                file:mr-3 file:py-1.5 file:px-3 file:rounded-lg
                file:border-0 file:text-xs file:font-medium
                file:bg-indigo-600 file:text-white hover:file:bg-indigo-700
                file:cursor-pointer cursor-pointer"
              onChange={e => setResume(e.target.files[0])}
            />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input w-full resize-none" rows={3}
              value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>
        <div className="flex gap-3 justify-end p-5 border-t border-slate-700">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleSave} disabled={isSaving} className="btn-primary">
            {isSaving ? 'Adding…' : 'Add Candidate'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CandidatesPage() {
  const navigate = useNavigate()
  const qc       = useQueryClient()
  const [search,      setSearch]      = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [posFilter,   setPosFilter]   = useState('')
  const [showAdd,     setShowAdd]     = useState(false)
  const [searchInput, setSearchInput] = useState('')

  const params = {}
  if (stageFilter) params.stage    = stageFilter
  if (posFilter)   params.position = posFilter
  if (search)      params.search   = search

  const { data, isLoading } = useQuery({
    queryKey: ['hiring-candidates', stageFilter, posFilter, search],
    queryFn:  () => hiringService.candidateList(params).then(r => r.data),
  })
  const { data: jobsData } = useQuery({
    queryKey: ['hiring-jobs', 'all'],
    queryFn:  () => hiringService.jobList().then(r => r.data),
  })

  const candidates = Array.isArray(data) ? data : (data?.results ?? [])
  const jobs       = Array.isArray(jobsData) ? jobsData : (jobsData?.results ?? [])

  const addMutation = useMutation({
    mutationFn: (fd) => hiringService.candidateCreate(fd),
    onSuccess:  () => {
      toast.success('Candidate added')
      setShowAdd(false)
      qc.invalidateQueries({ queryKey: ['hiring-candidates'] })
      qc.invalidateQueries({ queryKey: ['hiring-dashboard'] })
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed to add candidate'),
  })

  const handleSearch = (e) => {
    e.preventDefault()
    setSearch(searchInput)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Candidates</h1>
          <p className="text-slate-400 text-sm mt-1">
            {candidates.length} candidate{candidates.length !== 1 ? 's' : ''}
            {stageFilter && ` in ${stageFilter.replace('_', ' ')}`}
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Candidate
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="input pl-9 w-56 text-sm"
            placeholder="Search name or email…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onBlur={() => setSearch(searchInput)}
          />
        </form>
        <select
          className="input text-sm"
          value={stageFilter}
          onChange={e => setStageFilter(e.target.value)}
        >
          {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select
          className="input text-sm"
          value={posFilter}
          onChange={e => setPosFilter(e.target.value)}
        >
          <option value="">All Positions</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.job_title}</option>)}
        </select>
        {(stageFilter || posFilter || search) && (
          <button
            onClick={() => { setStageFilter(''); setPosFilter(''); setSearch(''); setSearchInput('') }}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Loading…</div>
        ) : candidates.length === 0 ? (
          <div className="p-12 text-center">
            <UserSearch className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No candidates found</p>
            <button onClick={() => setShowAdd(true)} className="btn-primary mt-4 text-sm">
              Add First Candidate
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left">
                <th className="px-4 py-3 text-xs text-slate-400 font-medium">Candidate</th>
                <th className="px-4 py-3 text-xs text-slate-400 font-medium hidden sm:table-cell">Position</th>
                <th className="px-4 py-3 text-xs text-slate-400 font-medium">Stage</th>
                <th className="px-4 py-3 text-xs text-slate-400 font-medium hidden md:table-cell">Rating</th>
                <th className="px-4 py-3 text-xs text-slate-400 font-medium hidden lg:table-cell">Applied</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {candidates.map(c => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/hr/hiring/candidates/${c.id}`)}
                  className="hover:bg-slate-700/20 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-200">{c.candidate_name}</p>
                    <p className="text-xs text-slate-500">{c.email}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs hidden sm:table-cell">
                    {c.position_title || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StageBadge stage={c.current_stage} />
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {c.rating ? <StarRating value={c.rating} /> : <span className="text-slate-600 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs hidden lg:table-cell">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <AddCandidateModal
          jobs={jobs}
          onClose={() => setShowAdd(false)}
          onSave={(fd) => addMutation.mutate(fd)}
          isSaving={addMutation.isPending}
        />
      )}
    </div>
  )
}
