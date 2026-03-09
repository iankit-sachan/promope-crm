import clsx from 'clsx'

export default function StatCard({ title, value, icon: Icon, color = 'indigo', subtitle, trend }) {
  const colorMap = {
    indigo: 'bg-indigo-500/10 text-indigo-400',
    green:  'bg-green-500/10 text-green-400',
    yellow: 'bg-yellow-500/10 text-yellow-400',
    red:    'bg-red-500/10 text-red-400',
    blue:   'bg-blue-500/10 text-blue-400',
    orange: 'bg-orange-500/10 text-orange-400',
    purple: 'bg-purple-500/10 text-purple-400',
  }

  return (
    <div className="stat-card fade-in">
      <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0', colorMap[color])}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-bold text-white mt-0.5">{value ?? '—'}</p>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {trend && (
        <div className={clsx(
          'text-xs font-medium px-2 py-1 rounded-full',
          trend > 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
        )}>
          {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </div>
      )}
    </div>
  )
}
