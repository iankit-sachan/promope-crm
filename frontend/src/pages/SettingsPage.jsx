import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings, User, Lock, Bell } from 'lucide-react'
import { authService } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { initials } from '../utils/helpers'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: Lock },
]

export default function SettingsPage() {
  const [tab, setTab] = useState('profile')
  const { user, updateUser } = useAuthStore()

  const [profileForm, setProfileForm] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
  })

  const [pwForm, setPwForm] = useState({
    old_password: '',
    new_password: '',
    confirm: '',
  })

  const profileMutation = useMutation({
    mutationFn: (data) => authService.updateProfile(data),
    onSuccess: ({ data }) => {
      updateUser(data)
      toast.success('Profile updated!')
    },
  })

  const passwordMutation = useMutation({
    mutationFn: (data) => authService.changePassword(data),
    onSuccess: () => {
      toast.success('Password changed!')
      setPwForm({ old_password: '', new_password: '', confirm: '' })
    },
    onError: (e) => {
      toast.error(e.response?.data?.old_password?.[0] || 'Failed to change password')
    },
  })

  const handlePasswordSubmit = (e) => {
    e.preventDefault()
    if (pwForm.new_password !== pwForm.confirm) {
      toast.error('Passwords do not match')
      return
    }
    passwordMutation.mutate({
      old_password: pwForm.old_password,
      new_password: pwForm.new_password,
    })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-indigo-400" />
          Settings
        </h1>
        <p className="text-slate-400 text-sm mt-1">Manage your account preferences</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-700">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors',
              tab === id
                ? 'text-indigo-400 border-b-2 border-indigo-400'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="card">
          {/* Avatar */}
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-700">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-xl font-bold text-white">
              {initials(user?.full_name)}
            </div>
            <div>
              <p className="font-semibold text-white">{user?.full_name}</p>
              <p className="text-slate-400 text-sm capitalize">{user?.role}</p>
              <p className="text-slate-500 text-xs">{user?.email}</p>
            </div>
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); profileMutation.mutate(profileForm) }}
            className="space-y-4"
          >
            <div>
              <label className="label">Full Name</label>
              <input className="input" value={profileForm.full_name}
                onChange={e => setProfileForm({...profileForm, full_name: e.target.value})} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={profileForm.email}
                onChange={e => setProfileForm({...profileForm, email: e.target.value})} />
            </div>
            <div>
              <label className="label">Role</label>
              <input className="input capitalize" value={user?.role} disabled
                className="input opacity-50 cursor-not-allowed" />
              <p className="text-xs text-slate-500 mt-1">Role can only be changed by an admin.</p>
            </div>
            <button
              type="submit"
              disabled={profileMutation.isPending}
              className="btn-primary"
            >
              {profileMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>
      )}

      {tab === 'security' && (
        <div className="card">
          <h3 className="font-semibold mb-5">Change Password</h3>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="label">Current Password</label>
              <input className="input" type="password" required
                value={pwForm.old_password}
                onChange={e => setPwForm({...pwForm, old_password: e.target.value})} />
            </div>
            <div>
              <label className="label">New Password</label>
              <input className="input" type="password" required minLength={8}
                value={pwForm.new_password}
                onChange={e => setPwForm({...pwForm, new_password: e.target.value})} />
            </div>
            <div>
              <label className="label">Confirm New Password</label>
              <input className="input" type="password" required
                value={pwForm.confirm}
                onChange={e => setPwForm({...pwForm, confirm: e.target.value})} />
            </div>
            <button
              type="submit"
              disabled={passwordMutation.isPending}
              className="btn-primary"
            >
              {passwordMutation.isPending ? 'Changing...' : 'Change Password'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
