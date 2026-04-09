/**
 * Axios API client with JWT interceptors.
 * Automatically attaches Bearer token and handles 401 token refresh.
 */

import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'

const API_BASE = '/api'

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor: attach access token ──────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().getAccessToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ── Response interceptor: handle 401 + refresh token ─────────────────────────
let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error)
    else prom.resolve(token)
  })
  failedQueue = []
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          return api(originalRequest)
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      const refreshToken = useAuthStore.getState().getRefreshToken()

      if (!refreshToken) {
        useAuthStore.getState().logout()
        window.location.href = '/login'
        return Promise.reject(error)
      }

      try {
        const { data } = await axios.post(`${API_BASE}/auth/token/refresh/`, {
          refresh: refreshToken,
        })

        useAuthStore.getState().updateTokens(data.access, data.refresh || refreshToken)
        processQueue(null, data.access)
        originalRequest.headers.Authorization = `Bearer ${data.access}`
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        useAuthStore.getState().logout()
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    // Show error toast for 400/500 errors (but not 401 which is handled above)
    const msg = error.response?.data?.detail || error.response?.data?.message || 'An error occurred'
    if (error.response?.status >= 400 && error.response?.status !== 401) {
      toast.error(msg)
    }

    return Promise.reject(error)
  }
)

export default api

// ── Typed service helpers ─────────────────────────────────────────────────────

export const authService = {
  login: (email, password) => api.post('/auth/login/', { email, password }),
  logout: (refresh) => api.post('/auth/logout/', { refresh }),
  profile: () => api.get('/auth/profile/'),
  updateProfile: (data) => api.patch('/auth/profile/', data),
  changePassword: (data) => api.post('/auth/change-password/', data),
}

export const employeeService = {
  list: (params) => api.get('/employees/', { params }),
  get: (id) => api.get(`/employees/${id}/`),
  create: (data) => api.post('/employees/', data),
  update: (id, data) => api.patch(`/employees/${id}/`, data),
  delete: (id) => api.delete(`/employees/${id}/`),
  activity: (id) => api.get(`/employees/${id}/activity/`),
  tasks: (id) => api.get(`/employees/${id}/tasks/`),
  activeToday: () => api.get('/employees/active-today/'),
}

export const roleService = {
  list:     ()   => api.get('/employees/role-management/'),
  assignHR: (id) => api.patch(`/employees/${id}/assign-hr/`),
  removeHR: (id) => api.patch(`/employees/${id}/remove-hr/`),
}

export const taskService = {
  list: (params) => api.get('/tasks/', { params }),
  get: (id) => api.get(`/tasks/${id}/`),
  create: (data) => api.post('/tasks/', data),
  update: (id, data) => api.patch(`/tasks/${id}/`, data),
  delete: (id) => api.delete(`/tasks/${id}/`),
  updateProgress: (id, data) => api.patch(`/tasks/${id}/progress/`, data),
  addComment: (id, content) => api.post(`/tasks/${id}/comments/`, { content }),
  uploadAttachment: (id, formData) =>
    api.post(`/tasks/${id}/attachments/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
}

export const departmentService = {
  list: () => api.get('/departments/'),
  get: (id) => api.get(`/departments/${id}/`),
  create: (data) => api.post('/departments/', data),
  update: (id, data) => api.patch(`/departments/${id}/`, data),
  delete: (id) => api.delete(`/departments/${id}/`),
}

export const activityService = {
  list: (params) => api.get('/activity/', { params }),
}

export const notificationService = {
  list: () => api.get('/notifications/'),
  unreadCount: () => api.get('/notifications/unread-count/'),
  markRead: (id) => api.patch(`/notifications/${id}/read/`),
  markAllRead: () => api.post('/notifications/mark-all-read/'),
}

export const analyticsService = {
  dashboard: () => api.get('/analytics/dashboard/'),
  tasksOverTime: (days = 30) => api.get(`/analytics/tasks-over-time/?days=${days}`),
  tasksByDepartment: () => api.get('/analytics/tasks-by-department/'),
  employeeProductivity: () => api.get('/analytics/employee-productivity/'),
  tasksByPriority: () => api.get('/analytics/tasks-by-priority/'),
  completionRate: () => api.get('/analytics/completion-rate/'),
}

export const worklogService = {
  today:  ()           => api.get('/worklogs/today/'),
  list:   (params)     => api.get('/worklogs/', { params }),
  get:    (id)         => api.get(`/worklogs/${id}/`),
  create: (data)       => api.post('/worklogs/', data),
  update: (id, data)   => api.patch(`/worklogs/${id}/`, data),
  delete: (id)         => api.delete(`/worklogs/${id}/`),
}

export const reportService = {
  daily:   (params) => api.get('/reports/daily/',   { params }),
  weekly:  (params) => api.get('/reports/weekly/',  { params }),
  monthly: (params) => api.get('/reports/monthly/', { params }),
  trend:   (params) => api.get('/reports/trend/',   { params }),
}

export const chatService = {
  // Users available to DM (role-filtered, accessible to all authenticated users)
  messageableUsers: (params) => api.get('/chat/users/', { params }),

  // Direct conversations
  conversations:      ()         => api.get('/chat/conversations/'),
  createConversation: (userId)   => api.post('/chat/conversations/create/', { user_id: userId }),
  conversationMessages: (id)     => api.get(`/chat/conversations/${id}/messages/`),
  sendDirectMessage:  (id, data) => {
    if (data instanceof FormData) {
      return api.post(`/chat/conversations/${id}/send/`, data, { headers: { 'Content-Type': 'multipart/form-data' } })
    }
    return api.post(`/chat/conversations/${id}/send/`, data)
  },

  // Groups
  groups:            ()           => api.get('/chat/groups/'),
  createGroup:       (data)       => api.post('/chat/groups/', data),
  groupDetail:       (id)         => api.get(`/chat/groups/${id}/`),
  updateGroup:       (id, data)   => api.patch(`/chat/groups/${id}/`, data),
  deleteGroup:       (id)         => api.delete(`/chat/groups/${id}/`),
  groupMessages:     (id)         => api.get(`/chat/groups/${id}/messages/`),
  sendGroupMessage:  (id, data)   => {
    if (data instanceof FormData) {
      return api.post(`/chat/groups/${id}/send/`, data, { headers: { 'Content-Type': 'multipart/form-data' } })
    }
    return api.post(`/chat/groups/${id}/send/`, data)
  },
  addGroupMember:    (id, userId) => api.post(`/chat/groups/${id}/members/`, { user_id: userId }),
  removeGroupMember: (id, userId) => api.delete(`/chat/groups/${id}/members/${userId}/`),

  // PDF Reports
  myReports:    ()        => api.get('/chat/reports/'),
  submitReport: (formData)=> api.post('/chat/reports/', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  adminReports: (params)  => api.get('/chat/reports/admin/', { params }),
  reportDetail: (id)      => api.get(`/chat/reports/${id}/`),
  reviewReport: (id, data)=> api.patch(`/chat/reports/${id}/`, data),
}

export const hrService = {
  // Dashboard
  dashboard:        ()           => api.get('/hr/dashboard/'),

  // Leave management
  leaveList:        (params)     => api.get('/hr/leave/', { params }),
  leaveCreate:      (data)       => api.post('/hr/leave/', data),
  leaveApprove:     (id, data)   => api.post(`/hr/leave/${id}/approve/`, data),
  leaveReject:      (id, data)   => api.post(`/hr/leave/${id}/reject/`, data),
  leaveBalances:    (params)     => api.get('/hr/leave/balances/', { params }),

  // Attendance (HR view)
  attendance:       (params)     => api.get('/hr/attendance/', { params }),
  attendanceExport: (params)     => api.get('/hr/attendance/export/', { params, responseType: 'blob' }),

  // Documents
  documentList:     (params)     => api.get('/hr/documents/', { params }),
  documentUpload:   (formData)   => api.post('/hr/documents/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  documentReview:   (id, data)   => api.patch(`/hr/documents/${id}/`, data),

  // Performance reports
  reports:          (params)     => api.get('/hr/reports/', { params }),

  // Recruitment
  positionList:     (params)     => api.get('/hr/recruitment/', { params }),
  positionCreate:   (data)       => api.post('/hr/recruitment/', data),
  positionUpdate:   (id, data)   => api.patch(`/hr/recruitment/${id}/`, data),
  positionDelete:   (id)         => api.delete(`/hr/recruitment/${id}/`),
  applicantList:    (posId)      => api.get(`/hr/recruitment/${posId}/applicants/`),
  applicantCreate:  (posId, fd)  => api.post(`/hr/recruitment/${posId}/applicants/`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  applicantUpdate:  (id, data)   => api.patch(`/hr/recruitment/applicants/${id}/`, data),

  // HR Task Assignment
  taskStats:   ()              => api.get('/hr/tasks/stats/'),
  taskList:    (params)        => api.get('/hr/tasks/', { params }),
  taskCreate:  (data)          => api.post('/hr/tasks/', data),
  taskGet:     (id)            => api.get(`/hr/tasks/${id}/`),
  taskUpdate:  (id, data)      => api.patch(`/hr/tasks/${id}/`, data),
  taskDelete:  (id)            => api.delete(`/hr/tasks/${id}/`),
}

export const remoteService = {
  agentList:      ()       => api.get('/remote/agents/'),
  myToken:        ()       => api.get('/remote/agents/my-token/'),
  registerAgent:  (data)   => api.post('/remote/agents/register/', data),
  sessionList:    ()       => api.get('/remote/sessions/'),
  requestSession: (data)   => api.post('/remote/sessions/request/', data),
  endSession:     (id)     => api.post(`/remote/sessions/${id}/end/`),
}

export const payrollService = {
  // Payroll dashboard
  dashboard:       (params)   => api.get('/hr/payroll/', { params }),

  // Salary structures
  salaryList:      (params)   => api.get('/hr/salaries/', { params }),
  salaryCreate:    (data)     => api.post('/hr/salaries/', data),
  salaryUpdate:    (id, data) => api.patch(`/hr/salaries/${id}/`, data),

  // Bank details
  bankList:        (params)   => api.get('/hr/bank-details/', { params }),
  bankCreate:      (data)     => api.post('/hr/bank-details/', data),
  bankUpdate:      (id, data) => api.patch(`/hr/bank-details/${id}/`, data),
  bankReview:      (id, data) => api.patch(`/hr/bank-details/${id}/review/`, data),
  bankHistory:     (id)       => api.get(`/hr/bank-details/${id}/history/`),
  bankExport:      ()         => api.get('/hr/bank-details/export/', { responseType: 'blob' }),

  // Salary payments
  paymentList:     (params)   => api.get('/hr/payments/', { params }),
  paymentCreate:   (data)     => api.post('/hr/payments/', data),
  paymentUpdate:   (id, data) => api.patch(`/hr/payments/${id}/`, data),

  // Payslips
  payslipList:     (params)   => api.get('/hr/payslips/', { params }),
  payslipGenerate: (data)     => api.post('/hr/payslips/generate/', data),
  payslipDownload: (id)       => api.get(`/hr/payslips/${id}/download/`, { responseType: 'blob' }),
}

export const attendanceService = {
  // Employee self-service
  checkin:   ()       => api.post('/attendance/checkin/'),
  checkout:  ()       => api.post('/attendance/checkout/'),
  today:     ()       => api.get('/attendance/today/'),
  myHistory: (params) => api.get('/attendance/my/', { params }),

  // Admin
  presence:  ()       => api.get('/attendance/presence/'),
  list:      (params) => api.get('/attendance/', { params }),

  // Reports
  dailyReport:   (params) => api.get('/attendance/reports/daily/',   { params }),
  weeklyReport:  (params) => api.get('/attendance/reports/weekly/',  { params }),
  monthlyReport: (params) => api.get('/attendance/reports/monthly/', { params }),
}

export const trackingService = {
  // Daily Work Reports
  reportList:    (params)     => api.get('/tracking/reports/', { params }),
  reportCreate:  (data)       => api.post('/tracking/reports/', data),
  reportUpdate:  (id, data)   => api.patch(`/tracking/reports/${id}/`, data),
  reportDetail:  (id)         => api.get(`/tracking/reports/${id}/`),
  reportReview:  (id, data)   => api.post(`/tracking/reports/${id}/review/`, data),
  reportSummary: (params)     => api.get('/tracking/reports/summary/', { params }),

  // Task Timers
  timerList:     (params)     => api.get('/tracking/timers/', { params }),
  timerStart:    (data)       => api.post('/tracking/timers/', data),
  timerStop:     (id, data)   => api.post(`/tracking/timers/${id}/stop/`, data),
  timerSummary:  (params)     => api.get('/tracking/timers/summary/', { params }),

  // Dashboards
  productivity:  (params)     => api.get('/tracking/productivity/', { params }),
  onlineUsers:   ()           => api.get('/tracking/online-users/'),

  // Activity Logs
  activityList:   (params)     => api.get('/activity/', { params }),
  logPageVisit:   (data)       => api.post('/activity/log-visit/', data),

  // Presence status (REST fallback when WebSocket is unavailable)
  updateStatus:   (status)     => api.post('/activity/update-status/', { status }),
  getUserStatus:  ()           => api.get('/activity/user-status/'),
}

// ── Hiring / Recruitment ──────────────────────────────────────────────────────
export const hiringService = {
  // Dashboard & Pipeline
  dashboard:       ()          => api.get('/hr/hiring/dashboard/'),
  pipeline:        (params={}) => api.get('/hr/hiring/pipeline/', { params }),

  // Job Positions
  jobList:         (params={}) => api.get('/hr/jobs/', { params }),
  jobCreate:       (data)      => api.post('/hr/jobs/', data),
  jobGet:          (id)        => api.get(`/hr/jobs/${id}/`),
  jobUpdate:       (id, data)  => api.patch(`/hr/jobs/${id}/`, data),
  jobDelete:       (id)        => api.delete(`/hr/jobs/${id}/`),

  // Candidates
  candidateList:   (params={}) => api.get('/hr/candidates/', { params }),
  candidateCreate: (data)      => api.post('/hr/candidates/', data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  candidateGet:    (id)        => api.get(`/hr/candidates/${id}/`),
  candidateUpdate: (id, data)  => api.patch(`/hr/candidates/${id}/`, data),
  candidateDelete: (id)        => api.delete(`/hr/candidates/${id}/`),
  candidateStage:  (id, stage) => api.post(`/hr/candidates/${id}/stage/`, { stage }),
  candidateConvert:(id, data)  => api.post(`/hr/candidates/${id}/convert/`, data),

  // Interviews
  interviewList:   (params={}) => api.get('/hr/interviews/', { params }),
  interviewCreate: (data)      => api.post('/hr/interviews/', data),
  interviewUpdate: (id, data)  => api.patch(`/hr/interviews/${id}/`, data),
  interviewDelete: (id)        => api.delete(`/hr/interviews/${id}/`),

  // Evaluations
  evalList:        (params={}) => api.get('/hr/evaluations/', { params }),
  evalCreate:      (data)      => api.post('/hr/evaluations/', data),
  evalUpdate:      (id, data)  => api.patch(`/hr/evaluations/${id}/`, data),
  evalDelete:      (id)        => api.delete(`/hr/evaluations/${id}/`),

  // Candidate Documents
  docList:         (params={}) => api.get('/hr/candidate-documents/', { params }),
  docUpload:       (data)      => api.post('/hr/candidate-documents/', data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  docDelete:       (id)        => api.delete(`/hr/candidate-documents/${id}/`),
}

// ── Daily Reports ─────────────────────────────────────────────────────────────
export const dailyReportService = {
  list:      (params) => api.get('/daily-reports/', { params }),
  myReports: (params) => api.get('/daily-reports/my-reports/', { params }),
  all:       (params) => api.get('/daily-reports/all/', { params }),
  analytics: ()       => api.get('/daily-reports/analytics/'),
  get:       (id)     => api.get(`/daily-reports/${id}/`),
  create:    (data)   => {
    const isForm = data instanceof FormData
    return api.post('/daily-reports/', data,
      isForm ? { headers: { 'Content-Type': 'multipart/form-data' } } : {})
  },
  update:    (id, data) => {
    const isForm = data instanceof FormData
    return api.patch(`/daily-reports/${id}/`, data,
      isForm ? { headers: { 'Content-Type': 'multipart/form-data' } } : {})
  },
  submit:    (id)       => api.post(`/daily-reports/${id}/submit/`),
  review:    (id, data) => api.patch(`/daily-reports/${id}/review/`, data),
}
