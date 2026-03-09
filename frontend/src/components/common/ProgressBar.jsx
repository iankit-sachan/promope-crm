import { progressColor } from '../../utils/helpers'
import clsx from 'clsx'

export default function ProgressBar({ value = 0, showLabel = true, size = 'md' }) {
  const heights = { sm: 'h-1', md: 'h-2', lg: 'h-3' }

  return (
    <div className="flex items-center gap-2">
      <div className={clsx('flex-1 bg-slate-700 rounded-full overflow-hidden', heights[size])}>
        <div
          className={clsx('h-full rounded-full transition-all duration-300', progressColor(value))}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-slate-400 w-8 text-right">{value}%</span>
      )}
    </div>
  )
}
