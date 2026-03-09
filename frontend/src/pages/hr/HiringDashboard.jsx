import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Briefcase, Users, TrendingUp, XCircle,
  ArrowRight, Target,
} from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts'
import { hiringService } from '../../services/api'
import clsx from 'clsx'

const STAGE_COLORS = {
  applied:        '#6366f1',
  screening:      '#8b5cf6',
  interview:      '#3b82f6',
  technical_test: '#06b6d4',
  final_round:    '#f59e0b',
  offer_sent:     '#f97316',
  hired:          '#22c55e',
  rejected:       '#ef4444',
}

const STAGE_LABELS = {
  applied:        'Applied',
  screening:      'Screening',
  interview:      'Interview',
  technical_test: 'Technical Test',
  final_round:    'Final Round',
  offer_sent:     'Offer Sent',
  hired:          'Hired',
  rejected:       'Rejected',
}

function StatCard({ label, value, icon: Icon, color, sub, onClick }) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'card flex items-center gap-4',
        onClick && 'cursor-pointer hover:border-slate-500 transition-colors',
      )}
    >
      <div className={clsx('p-3 rounded-xl', color)}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-slate-400 text-xs uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-white">{value ?? '—'}</p>
        {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm">
      <p className="text-slate-300 font-medium mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  )
}

export default function HiringDashboard() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['hiring-dashboard'],
    queryFn:  () => hiringService.dashboard().then(r => r.data),
    staleTime: 60_000,
  })

  const stageChartData = data
    ? Object.entries(data?.stage_distribution || {}).map(([key, count]) => ({
        name:  STAGE_LABELS[key] || key,
        count,
        fill:  STAGE_COLORS[key],
      }))
    : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Hiring Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">Track your full recruitment pipeline at a glance</p>
        </div>
        <button
          onClick={() => navigate('/hr/hiring/pipeline')}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Target className="w-4 h-4" />
          Open Pipeline
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Open Positions"
          value={isLoading ? '…' : data?.open_positions}
          icon={Briefcase}
          color="bg-indigo-500/20"
          onClick={() => navigate('/hr/hiring/jobs')}
        />
        <StatCard
          label="Total Applicants"
          value={isLoading ? '…' : data?.total_applicants}
          icon={Users}
          color="bg-blue-500/20"
          onClick={() => navigate('/hr/hiring/candidates')}
        />
        <StatCard
          label="Hires This Month"
          value={isLoading ? '…' : data?.hires_this_month}
          icon={TrendingUp}
          color="bg-green-500/20"
        />
        <StatCard
          label="Rejection Rate"
          value={isLoading ? '…' : `${data?.rejection_rate ?? 0}%`}
          icon={XCircle}
          color="bg-red-500/20"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline distribution */}
        <div className="card">
          <h3 className="font-semibold text-sm mb-4">Pipeline Distribution</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageChartData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis
                  type="category" dataKey="name"
                  tick={{ fill: '#94a3b8', fontSize: 10 }} width={90}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Candidates" radius={[0, 3, 3, 0]}>
                  {stageChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 6-month trend */}
        <div className="card">
          <h3 className="font-semibold text-sm mb-4">Hiring Trend (6 months)</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.hiring_trend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                <Line type="monotone" dataKey="applied" name="Applied" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="hired"   name="Hired"   stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Applications per job */}
      {data?.applications_per_job?.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm">Applications per Job</h3>
            <button
              onClick={() => navigate('/hr/hiring/jobs')}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.applications_per_job}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="job_title" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Applications" fill="#6366f1" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Quick stage summary cards */}
      {data?.stage_distribution && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {Object.entries(data.stage_distribution).map(([key, count]) => (
            <button
              key={key}
              onClick={() => navigate(`/hr/hiring/candidates?stage=${key}`)}
              className="card text-center py-3 hover:border-slate-500 transition-colors"
            >
              <p
                className="text-xl font-bold"
                style={{ color: STAGE_COLORS[key] }}
              >
                {count}
              </p>
              <p className="text-xs text-slate-500 mt-0.5 leading-tight">
                {STAGE_LABELS[key]}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
