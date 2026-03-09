import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Calendar, Clock, Video, MapPin, Edit2, Trash2, ExternalLink } from 'lucide-react'
import { hiringService, employeeService } from '../../services/api'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const TYPE_STYLE = {
  online:    'bg-blue-500/15 text-blue-400',
  in_person: 'bg-green-500/15 text-green-400',
}

function formatTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hour = parseInt(h, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${m} ${ampm}`
}

function groupByDate(interviews) {
  const today    = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7)

  const groups = { today: [], tomorrow: [], thisWeek: [], later: [], past: [] }

  for (const iv of interviews) {
    // I1: use noon to avoid DST boundary issues where midnight can land on previous day
    const d = new Date(iv.interview_date + 'T12:00:00')
    if (d < today)          groups.past.push(iv)
    else if (d.getTime() === today.getTime())    groups.today.push(iv)
    else if (d.getTime() === tomorrow.getTime()) groups.tomorrow.push(iv)
    else if (d < nextWeek)  groups.thisWeek.push(iv)
    else                    groups.later.push(iv)
  }
  return groups
}

const EMPTY_FORM = {
  candidate: '', interviewer: '', interview_date: '',
  interview_time: '', interview_type: 'online', meeting_link: '', notes: '',
}

function InterviewModal({ candidates, employees, onClose, onSave, isSaving, existing }) {
  const [form, setForm] = useState(existing ? {
    candidate:      existing.candidate,
    interviewer:    existing.interviewer,
    interview_date: existing.interview_date,
    interview_time: existing.interview_time,
    interview_type: existing.interview_type,
    meeting_link:   existing.meeting_link || '',
    notes:          existing.notes || '',
  } : { ...EMPTY_FORM })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = () => {
    if (!form.candidate || !form.interviewer || !form.interview_date || !form.interview_time) {
      toast.error('Candidate, interviewer, date, and time are required')
      return
    }
    onSave(form)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg fade-in">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h3 className="font-semibold text-white">{existing ? 'Edit Interview' : 'Schedule Interview'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="label">Candidate *</label>
            <select className="input w-full" value={form.candidate}
              onChange={e => set('candidate', e.target.value)}>
              <option value="">— Select candidate —</option>
              {candidates.map(c => (
                <option key={c.id} value={c.id}>{c.candidate_name} ({c.current_stage?.replace('_', ' ')})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Interviewer *</label>
            <select className="input w-full" value={form.interviewer}
              onChange={e => set('interviewer', e.target.value)}>
              <option value="">— Select interviewer —</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date *</label>
              <input type="date" className="input w-full" value={form.interview_date}
                onChange={e => set('interview_date', e.target.value)} />
            </div>
            <div>
              <label className="label">Time *</label>
              <input type="time" className="input w-full" value={form.interview_time}
                onChange={e => set('interview_time', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Interview Type</label>
            <select className="input w-full" value={form.interview_type}
              onChange={e => set('interview_type', e.target.value)}>
              <option value="online">Online</option>
              <option value="in_person">In Person</option>
            </select>
          </div>
          <div>
            <label className="label">Meeting Link</label>
            <input className="input w-full" placeholder="https://meet.google.com/..."
              value={form.meeting_link} onChange={e => set('meeting_link', e.target.value)} />
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
            {isSaving ? 'Saving…' : existing ? 'Save Changes' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  )
}

function InterviewCard({ interview, onEdit, onDelete }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-slate-200">{interview.candidate_name}</p>
            <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', TYPE_STYLE[interview.interview_type])}>
              {interview.interview_type === 'online' ? 'Online' : 'In Person'}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-1.5 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Clock className="w-3 h-3" />
              {formatTime(interview.interview_time)}
            </span>
            <span className="text-xs text-slate-500">
              Interviewer: <span className="text-slate-400">{interview.interviewer_name}</span>
            </span>
          </div>
          {interview.notes && (
            <p className="text-xs text-slate-500 mt-1.5 truncate">{interview.notes}</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {interview.meeting_link && (
            <a
              href={interview.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="p-1.5 hover:bg-indigo-500/20 rounded text-slate-400 hover:text-indigo-400 transition-colors"
              title="Join meeting"
            >
              <Video className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            onClick={() => onEdit(interview)}
            className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(interview)}
            className="p-1.5 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

function DateSection({ title, interviews, onEdit, onDelete, accent }) {
  if (!interviews.length) return null
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <p className={clsx('text-xs font-semibold uppercase tracking-wide', accent)}>{title}</p>
        <span className="text-xs bg-slate-700/60 text-slate-400 rounded-full px-1.5 py-0.5">{interviews.length}</span>
      </div>
      <div className="space-y-2">
        {interviews.map(iv => (
          <InterviewCard key={iv.id} interview={iv} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </div>
  )
}

export default function InterviewScheduler() {
  const qc = useQueryClient()
  const [showModal, setShowModal]     = useState(false)
  const [editInterview, setEditInterview] = useState(null)
  const [confirmDel, setConfirmDel]   = useState(null)

  const { data: ivData, isLoading } = useQuery({
    queryKey: ['interviews'],
    queryFn:  () => hiringService.interviewList().then(r => r.data),
  })
  const { data: candData } = useQuery({
    queryKey: ['hiring-candidates', '', '', ''],
    queryFn:  () => hiringService.candidateList().then(r => r.data),
  })
  // I3: static top-level import instead of dynamic import inside queryFn
  const { data: empData } = useQuery({
    queryKey: ['employees-list'],
    queryFn:  () => employeeService.list().then(r => r.data),
  })

  const interviews = Array.isArray(ivData) ? ivData : (ivData?.results ?? [])
  const candidates = Array.isArray(candData) ? candData : (candData?.results ?? [])
  const employees  = Array.isArray(empData)  ? empData  : (empData?.results ?? [])

  // I2: numeric time sort to handle "HH:MM:SS" format correctly
  const toMins = t => { const [h, m] = t.split(':'); return +h * 60 + +m }
  const sorted = useMemo(() =>
    [...interviews].sort((a, b) =>
      a.interview_date.localeCompare(b.interview_date) || toMins(a.interview_time) - toMins(b.interview_time)
    ), [interviews])

  const groups = useMemo(() => groupByDate(sorted), [sorted])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['interviews'] })

  const createMutation = useMutation({
    mutationFn: (d) => hiringService.interviewCreate(d),
    onSuccess: () => { toast.success('Interview scheduled'); setShowModal(false); invalidate() },
    onError:   (e) => toast.error(e.response?.data?.detail || 'Failed to schedule'),
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => hiringService.interviewUpdate(id, data),
    onSuccess: () => { toast.success('Interview updated'); setEditInterview(null); invalidate() },
    onError:   (e) => toast.error(e.response?.data?.detail || 'Failed to update'),
  })
  const deleteMutation = useMutation({
    mutationFn: (id) => hiringService.interviewDelete(id),
    onSuccess: () => { toast.success('Interview cancelled'); setConfirmDel(null); invalidate() },
    onError:   (e) => toast.error(e.response?.data?.detail || 'Failed to cancel'),
  })

  const handleSave = (form) => {
    if (editInterview) {
      updateMutation.mutate({ id: editInterview.id, data: form })
    } else {
      createMutation.mutate(form)
    }
  }

  const totalUpcoming = groups.today.length + groups.tomorrow.length + groups.thisWeek.length + groups.later.length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Interviews</h1>
          <p className="text-slate-400 text-sm mt-1">
            {totalUpcoming} upcoming interview{totalUpcoming !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Schedule Interview
        </button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-slate-500">Loading…</div>
      ) : interviews.length === 0 ? (
        <div className="card p-12 text-center">
          <Calendar className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No interviews scheduled</p>
          <button onClick={() => setShowModal(true)} className="btn-primary mt-4 text-sm">
            Schedule First Interview
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <DateSection title="Today"     interviews={groups.today}    accent="text-green-400"  onEdit={setEditInterview} onDelete={setConfirmDel} />
          <DateSection title="Tomorrow"  interviews={groups.tomorrow} accent="text-blue-400"   onEdit={setEditInterview} onDelete={setConfirmDel} />
          <DateSection title="This Week" interviews={groups.thisWeek} accent="text-indigo-400" onEdit={setEditInterview} onDelete={setConfirmDel} />
          <DateSection title="Later"     interviews={groups.later}    accent="text-slate-400"  onEdit={setEditInterview} onDelete={setConfirmDel} />
          <DateSection title="Past"      interviews={groups.past}     accent="text-slate-600"  onEdit={setEditInterview} onDelete={setConfirmDel} />
        </div>
      )}

      {/* Schedule modal */}
      {(showModal || editInterview) && (
        <InterviewModal
          candidates={candidates}
          employees={employees}
          existing={editInterview || null}
          onClose={() => { setShowModal(false); setEditInterview(null) }}
          onSave={handleSave}
          isSaving={createMutation.isPending || updateMutation.isPending}
        />
      )}

      {/* Delete confirm */}
      {confirmDel && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-sm fade-in">
            <h3 className="font-semibold text-white mb-2">Cancel Interview?</h3>
            <p className="text-slate-400 text-sm">
              Cancel interview with <span className="text-white">{confirmDel.candidate_name}</span> on{' '}
              {new Date(confirmDel.interview_date + 'T00:00:00').toLocaleDateString()}? This cannot be undone.
            </p>
            <div className="flex gap-3 mt-5 justify-end">
              <button onClick={() => setConfirmDel(null)} className="btn-ghost text-sm">Keep</button>
              <button
                onClick={() => deleteMutation.mutate(confirmDel.id)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
              >
                {deleteMutation.isPending ? 'Cancelling…' : 'Cancel Interview'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
