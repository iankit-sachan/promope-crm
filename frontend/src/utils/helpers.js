/**
 * Shared utility functions used across the CRM frontend.
 */

import { formatDistanceToNow, format, parseISO } from 'date-fns'

/**
 * Format a date string as "Mar 5, 2026"
 */
export const formatDate = (dateStr) => {
  if (!dateStr) return '—'
  try {
    return format(parseISO(dateStr), 'MMM d, yyyy')
  } catch {
    return dateStr
  }
}

/**
 * Format a datetime as "10:32 AM"
 */
export const formatTime = (dateStr) => {
  if (!dateStr) return ''
  try {
    return format(parseISO(dateStr), 'h:mm a')
  } catch {
    return dateStr
  }
}

/**
 * Format relative time: "3 minutes ago"
 */
export const timeAgo = (dateStr) => {
  if (!dateStr) return ''
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true })
  } catch {
    return dateStr
  }
}

/**
 * Returns the CSS class for a task status badge.
 */
export const getStatusClass = (status) => {
  const map = {
    pending: 'status-pending',
    in_progress: 'status-in_progress',
    completed: 'status-completed',
    delayed: 'status-delayed',
    cancelled: 'status-cancelled',
  }
  return map[status] || 'badge bg-slate-500/10 text-slate-400'
}

/**
 * Returns the CSS class for a priority badge.
 */
export const getPriorityClass = (priority) => {
  const map = {
    low: 'priority-low',
    medium: 'priority-medium',
    high: 'priority-high',
    urgent: 'priority-urgent',
  }
  return map[priority] || 'badge bg-slate-500/10 text-slate-400'
}

/**
 * Returns a human-readable status label.
 */
export const statusLabel = (status) => {
  const map = {
    pending: 'Pending',
    in_progress: 'In Progress',
    completed: 'Completed',
    delayed: 'Delayed',
    cancelled: 'Cancelled',
    active: 'Active',
    inactive: 'Inactive',
    on_leave: 'On Leave',
  }
  return map[status] || status
}

/**
 * Progress bar color based on percentage.
 */
export const progressColor = (pct) => {
  if (pct >= 100) return 'bg-green-500'
  if (pct >= 60)  return 'bg-blue-500'
  if (pct >= 30)  return 'bg-yellow-500'
  return 'bg-red-500'
}

/**
 * Returns initials from a full name, e.g. "Rahul Sharma" → "RS"
 */
export const initials = (name = '') => {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/**
 * Verb to display message for activity feed events.
 */
export const verbToLabel = (verb) => {
  const map = {
    logged_in:        'logged in',
    logged_out:       'logged out',
    task_created:     'created task',
    task_started:     'started task',
    task_updated:     'updated task',
    task_completed:   'completed task',
    task_assigned:    'assigned task',
    task_delayed:     'marked task delayed',
    task_cancelled:   'cancelled task',
    employee_added:   'added employee',
    employee_updated: 'updated employee',
    employee_deleted: 'removed employee',
    updated_profile:  'updated profile',
    created_user:     'created user',
    progress_updated: 'updated progress on',
    comment_added:    'commented on',
  }
  return map[verb] || verb.replace(/_/g, ' ')
}

/**
 * Format a number as Indian currency, e.g. ₹1,23,456.00
 */
export const formatCurrency = (amount, currency = '₹') => {
  if (amount == null || amount === '') return '—'
  return `${currency}${Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/**
 * Truncates text to a max length.
 */
export const truncate = (text, maxLen = 60) => {
  if (!text) return ''
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
}
