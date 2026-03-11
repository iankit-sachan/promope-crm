import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Plus, Users, CheckSquare, TrendingUp, Trash2 } from 'lucide-react'
import { departmentService } from '../services/api'
import LoadingSpinner from '../components/common/LoadingSpinner'
import toast from 'react-hot-toast'

export default function DepartmentsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null) // { id, name }

  const deleteMutation = useMutation({
    mutationFn: (id) => departmentService.delete(id),
    onSuccess: () => {
      toast.success('Department deleted')
      setConfirmDelete(null)
      qc.invalidateQueries({ queryKey: ['departments'] })
    },
    onError: () => toast.error('Failed to delete department'),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentService.list().then(r => r.data),
  })

  const departments = data?.results || data || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-indigo-400" />
            Departments
          </h1>
          <p className="text-slate-400 text-sm mt-1">{departments.length} departments</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Department
        </button>
      </div>

      {isLoading ? (
        <LoadingSpinner text="Loading departments..." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((dept) => (
            <div
              key={dept.id}
              className="card hover:border-indigo-500/40 cursor-pointer transition-all duration-200 hover:shadow-card-hover"
              onClick={() => navigate(`/departments/${dept.id}`)}
            >
              {/* Color header */}
              <div className="h-2 rounded-t-lg -mx-5 -mt-5 mb-4"
                style={{ backgroundColor: dept.color }} />

              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-white text-lg">{dept.name}</h3>
                  {dept.description && (
                    <p className="text-slate-400 text-sm mt-0.5 line-clamp-2">{dept.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete({ id: dept.id, name: dept.name }) }}
                    className="p-1.5 hover:bg-red-500/15 rounded-lg transition-colors text-slate-500 hover:text-red-400"
                    title="Delete department"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${dept.color}20` }}
                  >
                    <Building2 className="w-5 h-5" style={{ color: dept.color }} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-700">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
                    <Users className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-lg font-bold text-white">{dept.employee_count}</p>
                  <p className="text-[10px] text-slate-500">Employees</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
                    <TrendingUp className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-lg font-bold text-indigo-400">{dept.active_tasks_count}</p>
                  <p className="text-[10px] text-slate-500">Active Tasks</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
                    <CheckSquare className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-lg font-bold text-green-400">—</p>
                  <p className="text-[10px] text-slate-500">Completed</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <DeptModal
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); qc.invalidateQueries({ queryKey: ['departments'] }) }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-sm p-6 fade-in">
            <h2 className="text-lg font-semibold text-white mb-2">Delete Department</h2>
            <p className="text-slate-400 text-sm mb-6">
              Are you sure you want to delete <span className="text-white font-medium">"{confirmDelete.name}"</span>? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="btn-secondary flex-1 justify-center">
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(confirmDelete.id)}
                disabled={deleteMutation.isPending}
                className="btn flex-1 justify-center bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DeptModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ name: '', description: '', color: '#6366f1' })

  const mutation = useMutation({
    mutationFn: (data) => departmentService.create(data),
    onSuccess: () => { toast.success('Department created!'); onSuccess() },
    onError: () => toast.error('Failed to create department'),
  })

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-6 fade-in">
        <h2 className="text-lg font-semibold mb-5">Add Department</h2>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form) }} className="space-y-4">
          <div>
            <label className="label">Name *</label>
            <input className="input" placeholder="e.g. Engineering" required
              value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={2} placeholder="What does this department do?"
              value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
          </div>
          <div>
            <label className="label">Color</label>
            <div className="flex gap-2 items-center">
              <input type="color" value={form.color}
                onChange={e => setForm({...form, color: e.target.value})}
                className="w-10 h-10 rounded cursor-pointer bg-transparent border-0" />
              <input className="input flex-1" value={form.color}
                onChange={e => setForm({...form, color: e.target.value})} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary flex-1 justify-center">
              {mutation.isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
