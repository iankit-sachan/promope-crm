import { useActivityStore } from '../../store/activityStore'
import { verbToLabel, timeAgo, initials } from '../../utils/helpers'
import { Activity } from 'lucide-react'
import clsx from 'clsx'

const verbColors = {
  logged_in:        'bg-green-500/10 text-green-400',
  logged_out:       'bg-slate-500/10 text-slate-400',
  task_created:     'bg-blue-500/10 text-blue-400',
  task_started:     'bg-indigo-500/10 text-indigo-400',
  task_completed:   'bg-green-500/10 text-green-400',
  task_assigned:    'bg-purple-500/10 text-purple-400',
  task_delayed:     'bg-red-500/10 text-red-400',
  task_updated:     'bg-yellow-500/10 text-yellow-400',
  progress_updated: 'bg-blue-500/10 text-blue-400',
  comment_added:    'bg-orange-500/10 text-orange-400',
  employee_added:   'bg-teal-500/10 text-teal-400',
  employee_updated: 'bg-yellow-500/10 text-yellow-400',
  default:          'bg-slate-500/10 text-slate-400',
}

export default function LiveActivityFeed() {
  const { activities, isConnected } = useActivityStore()

  return (
    <div className="card flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-400" />
          <h3 className="font-semibold text-sm">Live Activity Feed</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={clsx(
            'w-2 h-2 rounded-full',
            isConnected ? 'bg-green-400 pulse-dot' : 'bg-slate-500'
          )} />
          <span className="text-xs text-slate-500">
            {isConnected ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-500">
            <Activity className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No activity yet</p>
          </div>
        ) : (
          activities.map((event) => (
            <div
              key={event.id}
              className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-slate-700/20 transition-colors fade-in"
            >
              {/* Actor avatar */}
              <div className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-0.5">
                {initials(event.actor?.name || 'System')}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-200 leading-snug">
                  <span className="font-medium">{event.actor?.name || 'System'}</span>
                  {' '}
                  <span className="text-slate-400">{verbToLabel(event.verb)}</span>
                  {event.target_name && (
                    <>
                      {' '}
                      <span className="text-indigo-400">"{event.target_name}"</span>
                    </>
                  )}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{timeAgo(event.created_at)}</p>
              </div>

              {/* Verb badge */}
              <span className={clsx(
                'badge text-[10px] flex-shrink-0',
                verbColors[event.verb] || verbColors.default
              )}>
                {event.verb.replace(/_/g, ' ')}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
