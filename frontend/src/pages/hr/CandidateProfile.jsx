import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Star, Upload, FileText, ExternalLink,
  Calendar, Clock, Video, MapPin, Trash2, X,
  CheckCircle2, UserPlus, Linkedin, Globe,
} from 'lucide-react'
import { hiringService, departmentService } from '../../services/api'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const STAGES = [
  'applied', 'screening', 'interview', 'technical_test',
  'final_round', 'offer_sent', 'hired', 'rejected',
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

function ScoreBar({ label, value }) {
  const pct = value ? (value / 10) * 100 : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="text-xs font-medium text-slate-300">{value ?? '—'}/10</span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function ConvertModal({ candidate, departments, onClose, onConvert, isSaving }) {
  const [form, setForm] = useState({
    email:       candidate.email,
    role:        'employee',
    job_role:    candidate.position_title || '',
    department:  '',
    joining_date: new Date().toISOString().split('T')[0],
    salary:      '',
    password:    '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md fade-in">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h3 className="font-semibold text-white">Convert to Employee</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="label">Email</label>
            <input className="input w-full" value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Job Role / Title</label>
              <input className="input w-full" value={form.job_role} onChange={e => set('job_role', e.target.value)} />
            </div>
            <div>
              <label className="label">System Role</label>
              <select className="input w-full" value={form.role} onChange={e => set('role', e.target.value)}>
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="hr">HR</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Department</label>
              <select className="input w-full" value={form.department} onChange={e => set('department', e.target.value)}>
                <option value="">— None —</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Joining Date</label>
              <input type="date" className="input w-full" value={form.joining_date}
                onChange={e => set('joining_date', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Starting Salary</label>
              <input type="number" className="input w-full" placeholder="0" value={form.salary}
                onChange={e => set('salary', e.target.value)} />
            </div>
            <div>
              <label className="label">Temp Password</label>
              <input type="password" className="input w-full" placeholder="Auto-generated if blank"
                value={form.password} onChange={e => set('password', e.target.value)} />
            </div>
          </div>
        </div>
        <div className="flex gap-3 justify-end p-5 border-t border-slate-700">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={() => onConvert(form)} disabled={isSaving}
            className="btn-primary flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            {isSaving ? 'Converting…' : 'Create Employee'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CandidateProfile() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const qc         = useQueryClient()
  const [showConvert, setShowConvert] = useState(false)
  const [evalForm, setEvalForm] = useState({
    technical_skill_score: '', communication_score: '',
    problem_solving_score: '', culture_fit_score: '',
    overall_rating: '', comments: '',
  })
  const [uploadFile, setUploadFile]  = useState(null)
  const [uploadType, setUploadType]  = useState('resume')
  const [uploadTitle, setUploadTitle] = useState('')

  const { data: candidate, isLoading } = useQuery({
    queryKey: ['candidate', id],
    queryFn:  () => hiringService.candidateGet(id).then(r => r.data),
  })
  const { data: deptData } = useQuery({
    queryKey: ['departments'],
    queryFn:  () => departmentService.list().then(r => r.data),
  })
  const departments = Array.isArray(deptData) ? deptData : (deptData?.results ?? [])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['candidate', id] })

  const stageMutation = useMutation({
    mutationFn: (stage) => hiringService.candidateStage(id, stage),
    onSuccess:  () => { toast.success('Stage updated'); invalidate()
      qc.invalidateQueries({ queryKey: ['hiring-dashboard'] })
      qc.invalidateQueries({ queryKey: ['hiring-candidates'] })
    },
  })

  const ratingMutation = useMutation({
    mutationFn: (rating) => hiringService.candidateUpdate(id, { rating }),
    onSuccess:  () => { toast.success('Rating saved'); invalidate() },
  })

  const notesMutation = useMutation({
    mutationFn: (notes) => hiringService.candidateUpdate(id, { notes }),
    onSuccess:  () => toast.success('Notes saved'),
  })

  const evalMutation = useMutation({
    mutationFn: (data) => hiringService.evalCreate({ ...data, candidate: Number(id) }),
    onSuccess:  () => {
      toast.success('Evaluation saved')
      setEvalForm({ technical_skill_score: '', communication_score: '',
        problem_solving_score: '', culture_fit_score: '', overall_rating: '', comments: '' })
      invalidate()
    },
  })

  const docMutation = useMutation({
    mutationFn: (fd) => hiringService.docUpload(fd),
    onSuccess:  () => { toast.success('Document uploaded'); setUploadFile(null); invalidate() },
  })

  const docDeleteMutation = useMutation({
    mutationFn: (docId) => hiringService.docDelete(docId),
    onSuccess:  () => { toast.success('Document deleted'); invalidate() },
  })

  const convertMutation = useMutation({
    mutationFn: (data) => hiringService.candidateConvert(id, data),
    onSuccess:  (res) => {
      toast.success(`Employee ${res.data.employee_id} created!`)
      setShowConvert(false)
      invalidate()
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Conversion failed'),
  })

  const handleDocUpload = () => {
    if (!uploadFile || !uploadTitle.trim()) {
      toast.error('File and title required')
      return
    }
    const fd = new FormData()
    fd.append('candidate', id)
    fd.append('file', uploadFile)
    fd.append('doc_type', uploadType)
    fd.append('title', uploadTitle)
    docMutation.mutate(fd)
  }

  const [notes, setNotes] = useState(null)

  if (isLoading) return <div className="p-8 text-slate-500">Loading…</div>
  if (!candidate) return <div className="p-8 text-slate-500">Candidate not found.</div>

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-200 transition-colors mt-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-white">{candidate.candidate_name}</h1>
            <span className={clsx('px-2.5 py-1 rounded-full text-xs font-medium capitalize', stageStyle[candidate.current_stage])}>
              {candidate.current_stage?.replace('_', ' ')}
            </span>
            {candidate.converted_to_employee && (
              <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded-full">
                <CheckCircle2 className="w-3.5 h-3.5" /> Employee
              </span>
            )}
          </div>
          <p className="text-slate-400 text-sm mt-0.5">
            {candidate.email}
            {candidate.phone && ` · ${candidate.phone}`}
            {candidate.position_title && ` · Applied for: ${candidate.position_title}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left — main info */}
        <div className="lg:col-span-2 space-y-5">
          {/* Contact & links */}
          <div className="card space-y-2">
            <h3 className="font-semibold text-sm text-slate-300 mb-3">Contact Information</h3>
            {candidate.linkedin_profile && (
              <a href={candidate.linkedin_profile} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300">
                <Linkedin className="w-4 h-4" /> LinkedIn Profile
              </a>
            )}
            {candidate.portfolio_link && (
              <a href={candidate.portfolio_link} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300">
                <Globe className="w-4 h-4" /> Portfolio
              </a>
            )}
            {candidate.resume_url && (
              <a href={candidate.resume_url} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 text-sm text-green-400 hover:text-green-300">
                <FileText className="w-4 h-4" /> View Resume
              </a>
            )}
            <p className="text-xs text-slate-500 pt-1">
              Applied: {new Date(candidate.created_at).toLocaleDateString()}
            </p>
          </div>

          {/* Notes */}
          <div className="card space-y-3">
            <h3 className="font-semibold text-sm text-slate-300">Notes</h3>
            <textarea
              className="input w-full resize-none text-sm"
              rows={4}
              value={notes !== null ? notes : (candidate.notes || '')}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add notes about this candidate…"
            />
            <button
              onClick={() => notesMutation.mutate(notes !== null ? notes : (candidate.notes || ''))}
              disabled={notesMutation.isPending}
              className="btn-primary text-sm py-1.5"
            >
              {notesMutation.isPending ? 'Saving…' : 'Save Notes'}
            </button>
          </div>

          {/* Documents */}
          <div className="card space-y-3">
            <h3 className="font-semibold text-sm text-slate-300">Documents</h3>
            {candidate.documents?.length > 0 ? (
              <ul className="space-y-2">
                {candidate.documents.map(doc => (
                  <li key={doc.id} className="flex items-center gap-3 p-2 bg-slate-700/30 rounded-lg">
                    <FileText className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 truncate">{doc.title}</p>
                      <p className="text-xs text-slate-500 capitalize">{doc.doc_type.replace('_', ' ')}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <a href={doc.file_url} target="_blank" rel="noreferrer"
                        className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button onClick={() => docDeleteMutation.mutate(doc.id)}
                        className="p-1.5 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-400">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-500 text-sm">No documents uploaded</p>
            )}
            {/* Upload form */}
            <div className="border-t border-slate-700 pt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input className="input text-sm" placeholder="Document title"
                  value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} />
                <select className="input text-sm" value={uploadType} onChange={e => setUploadType(e.target.value)}>
                  <option value="resume">Resume</option>
                  <option value="portfolio">Portfolio</option>
                  <option value="cover_letter">Cover Letter</option>
                  <option value="interview_notes">Interview Notes</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  className="flex-1 text-xs text-slate-400
                  file:mr-2 file:py-1 file:px-2 file:rounded file:border-0
                  file:text-xs file:bg-slate-700 file:text-slate-300 hover:file:bg-slate-600 file:cursor-pointer"
                  onChange={e => setUploadFile(e.target.files[0])} />
                <button onClick={handleDocUpload} disabled={docMutation.isPending}
                  className="btn-primary text-sm py-1.5 flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  {docMutation.isPending ? '…' : 'Upload'}
                </button>
              </div>
            </div>
          </div>

          {/* Interviews */}
          <div className="card space-y-3">
            <h3 className="font-semibold text-sm text-slate-300">Interviews</h3>
            {candidate.interviews?.length > 0 ? (
              <ul className="space-y-3">
                {candidate.interviews.map(iv => (
                  <li key={iv.id} className="flex items-start gap-3 p-3 bg-slate-700/30 rounded-lg">
                    <div className={clsx('p-2 rounded-lg flex-shrink-0',
                      iv.interview_type === 'online' ? 'bg-blue-500/15' : 'bg-green-500/15')}>
                      {iv.interview_type === 'online'
                        ? <Video className="w-4 h-4 text-blue-400" />
                        : <MapPin className="w-4 h-4 text-green-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-slate-200">
                          {iv.interviewer_name || 'Interviewer TBD'}
                        </p>
                        <span className={clsx('text-xs px-1.5 py-0.5 rounded',
                          iv.interview_type === 'online' ? 'bg-blue-500/10 text-blue-400' : 'bg-green-500/10 text-green-400')}>
                          {iv.interview_type === 'online' ? 'Online' : 'In Person'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3" />
                        {new Date(iv.interview_date).toLocaleDateString()}
                        <Clock className="w-3 h-3 ml-1" />
                        {iv.interview_time}
                      </p>
                      {iv.meeting_link && (
                        <a href={iv.meeting_link} target="_blank" rel="noreferrer"
                          className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 mt-0.5">
                          <ExternalLink className="w-3 h-3" /> Join meeting
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-500 text-sm">No interviews scheduled yet</p>
            )}
          </div>

          {/* Evaluations */}
          {candidate.evaluations?.length > 0 && (
            <div className="card space-y-4">
              <h3 className="font-semibold text-sm text-slate-300">Evaluations</h3>
              {candidate.evaluations.map(ev => (
                <div key={ev.id} className="p-3 bg-slate-700/30 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-200">{ev.interviewer_name || 'Anonymous'}</p>
                    <span className="text-xs text-slate-400">{new Date(ev.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <ScoreBar label="Technical Skills" value={ev.technical_skill_score} />
                    <ScoreBar label="Communication"    value={ev.communication_score} />
                    <ScoreBar label="Problem Solving"  value={ev.problem_solving_score} />
                    <ScoreBar label="Culture Fit"      value={ev.culture_fit_score} />
                  </div>
                  {ev.overall_rating && (
                    <p className="text-sm text-slate-300">
                      Overall: <span className="font-semibold text-indigo-400">{ev.overall_rating}/10</span>
                    </p>
                  )}
                  {ev.comments && <p className="text-xs text-slate-400 italic">"{ev.comments}"</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right — actions */}
        <div className="space-y-5">
          {/* Stage */}
          <div className="card space-y-3">
            <h3 className="font-semibold text-sm text-slate-300">Current Stage</h3>
            <select
              className="input w-full capitalize"
              value={candidate.current_stage}
              onChange={e => stageMutation.mutate(e.target.value)}
              disabled={stageMutation.isPending}
            >
              {STAGES.map(s => (
                <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
              ))}
            </select>
            {candidate.current_stage === 'hired' && !candidate.converted_to_employee && (
              <button
                onClick={() => setShowConvert(true)}
                className="w-full btn-primary flex items-center justify-center gap-2 text-sm"
              >
                <UserPlus className="w-4 h-4" /> Convert to Employee
              </button>
            )}
          </div>

          {/* Rating */}
          <div className="card space-y-3">
            <h3 className="font-semibold text-sm text-slate-300">Candidate Rating</h3>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(i => (
                <button key={i} onClick={() => ratingMutation.mutate(i)}
                  className="p-1 hover:scale-110 transition-transform">
                  <Star className={clsx('w-6 h-6',
                    i <= (candidate.rating || 0) ? 'text-amber-400 fill-amber-400' : 'text-slate-600')} />
                </button>
              ))}
            </div>
            {candidate.rating && (
              <p className="text-xs text-slate-500">{candidate.rating}/5 stars</p>
            )}
          </div>

          {/* Add Evaluation */}
          <div className="card space-y-3">
            <h3 className="font-semibold text-sm text-slate-300">Add Evaluation</h3>
            {[
              { key: 'technical_skill_score', label: 'Technical (1-10)' },
              { key: 'communication_score',   label: 'Communication (1-10)' },
              { key: 'problem_solving_score', label: 'Problem Solving (1-10)' },
              { key: 'culture_fit_score',     label: 'Culture Fit (1-10)' },
              { key: 'overall_rating',        label: 'Overall Rating (1-10)' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="label text-xs">{label}</label>
                <input type="number" min="1" max="10" className="input w-full text-sm"
                  value={evalForm[key]}
                  onChange={e => setEvalForm(f => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
            <div>
              <label className="label text-xs">Comments</label>
              <textarea className="input w-full resize-none text-sm" rows={3}
                value={evalForm.comments}
                onChange={e => setEvalForm(f => ({ ...f, comments: e.target.value }))} />
            </div>
            <button
              onClick={() => evalMutation.mutate(evalForm)}
              disabled={evalMutation.isPending}
              className="btn-primary w-full text-sm"
            >
              {evalMutation.isPending ? 'Saving…' : 'Submit Evaluation'}
            </button>
          </div>
        </div>
      </div>

      {showConvert && (
        <ConvertModal
          candidate={candidate}
          departments={departments}
          onClose={() => setShowConvert(false)}
          onConvert={(data) => convertMutation.mutate(data)}
          isSaving={convertMutation.isPending}
        />
      )}
    </div>
  )
}
