import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Briefcase, MapPin, Clock, Users, Edit2, Trash2 } from 'lucide-react'
import { hiringService, departmentService } from '../../services/api'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const EMPLOYMENT_TYPES = [
  { value: 'full_time',  label: 'Full Time' },
  { value: 'part_time',  label: 'Part Time' },
  { value: 'internship', label: 'Internship' },
  { value: 'contract',   label: 'Contract' },
]

const STATUS_FILTER = ['all', 'open', 'paused', 'closed']

const statusStyle = {
  open:   'bg-green-500/15 text-green-400 border border-green-500/30',
  paused: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  closed: 'bg-red-500/15 text-red-400 border border-red-500/30',
}

const typeStyle = {
  full_time:  'bg-indigo-500/15 text-indigo-400',
  part_time:  'bg-blue-500/15 text-blue-400',
  internship: 'bg-purple-500/15 text-purple-400',
  contract:   'bg-orange-500/15 text-orange-400',
}

const EMPTY_FORM = {
  job_title: '', department: '', job_description: '',
  required_skills: '', experience_required: '',
  salary_range: '', job_location: '',
  employment_type: 'full_time', job_status: 'open',
}

function JobDrawer({ job, departments, onClose, onSave, isSaving }) {
  const [form, setForm] = useState(job ? {
    job_title: job.job_title, department: job.department || '',
    job_description: job.job_description, required_skills: job.required_skills || '',
    experience_required: job.experience_required || '',
    salary_range: job.salary_range || '', job_location: job.job_location || '',
    employment_type: job.employment_type, job_status: job.job_status,
  } : { ...EMPTY_FORM })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = () => {
    if (!form.job_title.trim() || !form.job_description.trim()) {
      toast.error('Title and description are required')
      return
    }
    onSave(form)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex justify-end">
      <div className="w-full max-w-lg bg-slate-800 border-l border-slate-700 h-full flex flex-col fade-in">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h3 className="font-semibold text-white">{job ? 'Edit Job' : 'New Job Position'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="label">Job Title *</label>
            <input className="input w-full" placeholder="e.g. Senior React Developer"
              value={form.job_title} onChange={e => set('job_title', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Department</label>
              <select className="input w-full" value={form.department}
                onChange={e => set('department', e.target.value ? Number(e.target.value) : '')}>
                <option value="">— None —</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Employment Type</label>
              <select className="input w-full" value={form.employment_type}
                onChange={e => set('employment_type', e.target.value)}>
                {EMPLOYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Salary Range</label>
              <input className="input w-full" placeholder="e.g. ₹8L – ₹12L"
                value={form.salary_range} onChange={e => set('salary_range', e.target.value)} />
            </div>
            <div>
              <label className="label">Location</label>
              <input className="input w-full" placeholder="e.g. Remote / Mumbai"
                value={form.job_location} onChange={e => set('job_location', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Experience Required</label>
            <input className="input w-full" placeholder="e.g. 2–4 years"
              value={form.experience_required} onChange={e => set('experience_required', e.target.value)} />
          </div>
          <div>
            <label className="label">Job Description *</label>
            <textarea className="input w-full resize-none" rows={4}
              placeholder="Describe responsibilities, role expectations..."
              value={form.job_description} onChange={e => set('job_description', e.target.value)} />
          </div>
          <div>
            <label className="label">Required Skills</label>
            <textarea className="input w-full resize-none" rows={3}
              placeholder="React, TypeScript, Node.js..."
              value={form.required_skills} onChange={e => set('required_skills', e.target.value)} />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input w-full" value={form.job_status}
              onChange={e => set('job_status', e.target.value)}>
              <option value="open">Open</option>
              <option value="paused">Paused</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>
        <div className="p-5 border-t border-slate-700 flex gap-3 justify-end">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleSave} disabled={isSaving} className="btn-primary">
            {isSaving ? 'Saving…' : job ? 'Save Changes' : 'Create Job'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function JobsPage() {
  const [statusFilter, setStatusFilter] = useState('all')
  const [drawerJob,    setDrawerJob]    = useState(null)   // null = closed, false = new, obj = edit
  const [confirmDel,   setConfirmDel]   = useState(null)
  const qc = useQueryClient()

  const params = statusFilter !== 'all' ? { status: statusFilter } : {}

  const { data, isLoading } = useQuery({
    queryKey: ['hiring-jobs', statusFilter],
    queryFn:  () => hiringService.jobList(params).then(r => r.data),
  })
  const { data: deptData } = useQuery({
    queryKey: ['departments'],
    queryFn:  () => departmentService.list().then(r => r.data),
  })

  const jobs        = Array.isArray(data) ? data : (data?.results ?? [])
  const departments = Array.isArray(deptData) ? deptData : (deptData?.results ?? [])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['hiring-jobs'] })
    qc.invalidateQueries({ queryKey: ['hiring-dashboard'] })
  }

  const createMutation = useMutation({
    mutationFn: (d) => hiringService.jobCreate(d),
    onSuccess:  () => { toast.success('Job created'); setDrawerJob(null); invalidate() },
    onError:    (e) => toast.error(e.response?.data?.detail || 'Failed to create'),
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => hiringService.jobUpdate(id, data),
    onSuccess:  () => { toast.success('Job updated'); setDrawerJob(null); invalidate() },
    onError:    (e) => toast.error(e.response?.data?.detail || 'Failed to update'),
  })
  const deleteMutation = useMutation({
    mutationFn: (id) => hiringService.jobDelete(id),
    onSuccess:  () => { toast.success('Job deleted'); setConfirmDel(null); invalidate() },
    onError:    (e) => toast.error(e.response?.data?.detail || 'Failed to delete'),
  })

  const handleSave = (form) => {
    if (drawerJob && drawerJob.id) {
      updateMutation.mutate({ id: drawerJob.id, data: form })
    } else {
      createMutation.mutate(form)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Job Positions</h1>
          <p className="text-slate-400 text-sm mt-1">Manage all open job listings</p>
        </div>
        <button
          onClick={() => setDrawerJob(false)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> New Job
        </button>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2">
        {STATUS_FILTER.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={clsx(
              'px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors',
              statusFilter === s
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-700/50 text-slate-400 hover:text-slate-200',
            )}
          >
            {s === 'all' ? 'All' : s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Loading…</div>
        ) : jobs.length === 0 ? (
          <div className="p-12 text-center">
            <Briefcase className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No job positions yet</p>
            <button onClick={() => setDrawerJob(false)} className="btn-primary mt-4 text-sm">
              Post First Job
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left">
                <th className="px-4 py-3 text-xs text-slate-400 font-medium">Job Title</th>
                <th className="px-4 py-3 text-xs text-slate-400 font-medium hidden sm:table-cell">Dept</th>
                <th className="px-4 py-3 text-xs text-slate-400 font-medium hidden md:table-cell">Type</th>
                <th className="px-4 py-3 text-xs text-slate-400 font-medium hidden md:table-cell">Location</th>
                <th className="px-4 py-3 text-xs text-slate-400 font-medium">Status</th>
                <th className="px-4 py-3 text-xs text-slate-400 font-medium text-center">Candidates</th>
                <th className="px-4 py-3 text-xs text-slate-400 font-medium hidden lg:table-cell">Posted</th>
                <th className="px-4 py-3 text-xs text-slate-400 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {jobs.map(job => (
                <tr key={job.id} className="hover:bg-slate-700/20 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-200">{job.job_title}</p>
                    {job.salary_range && (
                      <p className="text-xs text-slate-500 mt-0.5">{job.salary_range}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 hidden sm:table-cell">
                    {job.department_name || '—'}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', typeStyle[job.employment_type])}>
                      {EMPLOYMENT_TYPES.find(t => t.value === job.employment_type)?.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 hidden md:table-cell">
                    {job.job_location ? (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />{job.job_location}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium capitalize', statusStyle[job.job_status])}>
                      {job.job_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="flex items-center justify-center gap-1 text-slate-300">
                      <Users className="w-3.5 h-3.5 text-slate-500" />
                      {job.candidate_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs hidden lg:table-cell">
                    {new Date(job.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setDrawerJob(job)}
                        className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDel(job)}
                        className="p-1.5 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Drawer */}
      {drawerJob !== null && (
        <JobDrawer
          job={drawerJob || null}
          departments={departments}
          onClose={() => setDrawerJob(null)}
          onSave={handleSave}
          isSaving={createMutation.isPending || updateMutation.isPending}
        />
      )}

      {/* Delete confirm */}
      {confirmDel && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-sm fade-in">
            <h3 className="font-semibold text-white mb-2">Delete Job?</h3>
            <p className="text-slate-400 text-sm">
              Delete <span className="text-white">"{confirmDel.job_title}"</span>? This cannot be undone.
            </p>
            <div className="flex gap-3 mt-5 justify-end">
              <button onClick={() => setConfirmDel(null)} className="btn-ghost text-sm">Cancel</button>
              <button
                onClick={() => deleteMutation.mutate(confirmDel.id)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
