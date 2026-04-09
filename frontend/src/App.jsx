import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { useActivityTracker } from './hooks/useActivityTracker'
import Layout from './components/common/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import EmployeesPage from './pages/EmployeesPage'
import EmployeeProfilePage from './pages/EmployeeProfilePage'
import TasksPage from './pages/TasksPage'
import TaskDetailPage from './pages/TaskDetailPage'
import DepartmentsPage from './pages/DepartmentsPage'
import AnalyticsPage from './pages/AnalyticsPage'
import SettingsPage from './pages/SettingsPage'
import AddEmployeePage from './pages/AddEmployeePage'
import AddTaskPage from './pages/AddTaskPage'
import ManagerDashboardPage from './pages/ManagerDashboardPage'
import WorkLogPage from './pages/WorkLogPage'
import ReportsPage from './pages/ReportsPage'
import AttendancePage from './pages/AttendancePage'
import MyAttendancePage from './pages/MyAttendancePage'
import ChatPage from './pages/ChatPage'

// HR module pages
import HRDashboardPage        from './pages/hr/HRDashboardPage'
import EmployeesHRPage        from './pages/hr/EmployeesHRPage'
import LeaveManagementPage    from './pages/hr/LeaveManagementPage'
import AttendanceHRPage       from './pages/hr/AttendanceHRPage'
import DocumentsHRPage        from './pages/hr/DocumentsHRPage'
import ReportsHRPage          from './pages/hr/ReportsHRPage'
import RecruitmentPage        from './pages/hr/RecruitmentPage'
import HRTaskManagementPage   from './pages/hr/HRTaskManagementPage'

// Hiring module pages
import HiringDashboard        from './pages/hr/HiringDashboard'
import JobsPage               from './pages/hr/JobsPage'
import CandidatesPage         from './pages/hr/CandidatesPage'
import CandidateProfile       from './pages/hr/CandidateProfile'
import HiringPipeline         from './pages/hr/HiringPipeline'
import InterviewScheduler     from './pages/hr/InterviewScheduler'

// Payroll module pages
import HRPayrollDashboard     from './pages/hr/HRPayrollDashboard'
import SalaryManagement       from './pages/hr/SalaryManagement'
import EmployeeBankDetailsPage from './pages/hr/EmployeeBankDetailsPage'
import PayslipViewer          from './pages/hr/PayslipViewer'

// Role Management
import RoleManagementPage from './pages/RoleManagementPage'

// Remote Control
import RemoteControlPage from './pages/RemoteControlPage'

// Activity Tracking pages
import ActivityMonitorDashboard from './pages/ActivityMonitorDashboard'
import { useAppVersion } from './hooks/useAppVersion'
import MyBankDetailsPage        from './pages/MyBankDetailsPage'
import DailyReportPage          from './pages/DailyReportPage'
import ActivityLogsPage         from './pages/ActivityLogsPage'
import TimeTrackingPage         from './pages/TimeTrackingPage'

/**
 * ProtectedRoute — role-aware guard.
 * requiredRoles: array of role strings that may access this route.
 * If omitted, any authenticated user can access.
 */
function ProtectedRoute({ children, requiredRoles }) {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (requiredRoles && !requiredRoles.includes(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

export default function App() {
  const { isAuthenticated, refreshProfile } = useAuthStore()

  // Sync role from server on startup (picks up role changes without logout)
  useEffect(() => {
    if (isAuthenticated) refreshProfile()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-log page visits to activity feed when authenticated
  useActivityTracker()

  // Check for new app version (only acts when running inside Android WebView)
  useAppVersion()

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />

        <Route path="/employees" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'manager', 'hr']}>
            <EmployeesPage />
          </ProtectedRoute>
        } />
        <Route path="/employees/add" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'manager', 'hr']}>
            <AddEmployeePage />
          </ProtectedRoute>
        } />
        <Route path="/employees/:id" element={<EmployeeProfilePage />} />

        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/tasks/add" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'manager', 'hr']}>
            <AddTaskPage />
          </ProtectedRoute>
        } />
        <Route path="/tasks/:id" element={<TaskDetailPage />} />

        <Route path="/departments" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'manager', 'hr']}>
            <DepartmentsPage />
          </ProtectedRoute>
        } />

        <Route path="/analytics" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'manager']}>
            <AnalyticsPage />
          </ProtectedRoute>
        } />

        {/* Work Log — all authenticated users */}
        <Route path="/worklogs" element={<WorkLogPage />} />

        {/* Chat — all authenticated users */}
        <Route path="/chat" element={<ChatPage />} />

        {/* Attendance — admin monitoring (manager+) and personal history (all) */}
        <Route path="/attendance" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'manager']}>
            <AttendancePage />
          </ProtectedRoute>
        } />
        <Route path="/my-attendance" element={<MyAttendancePage />} />
        <Route path="/my-bank-details" element={<MyBankDetailsPage />} />

        {/* Manager-only pages */}
        <Route path="/manager" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'manager']}>
            <ManagerDashboardPage />
          </ProtectedRoute>
        } />
        <Route path="/reports" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'manager']}>
            <ReportsPage />
          </ProtectedRoute>
        } />

        {/* ── HR Module ─────────────────────────────────────────── */}
        <Route path="/hr" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'hr']}>
            <HRDashboardPage />
          </ProtectedRoute>
        } />
        <Route path="/hr/employees" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'hr']}>
            <EmployeesHRPage />
          </ProtectedRoute>
        } />
        <Route path="/hr/leave" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'hr', 'manager', 'employee']}>
            <LeaveManagementPage />
          </ProtectedRoute>
        } />
        <Route path="/hr/attendance" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'hr']}>
            <AttendanceHRPage />
          </ProtectedRoute>
        } />
        <Route path="/hr/documents" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'hr']}>
            <DocumentsHRPage />
          </ProtectedRoute>
        } />
        <Route path="/hr/reports" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'hr']}>
            <ReportsHRPage />
          </ProtectedRoute>
        } />
        <Route path="/hr/tasks" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'hr']}>
            <HRTaskManagementPage />
          </ProtectedRoute>
        } />
        <Route path="/hr/recruitment" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'hr']}>
            <RecruitmentPage />
          </ProtectedRoute>
        } />

        {/* ── Hiring module routes ──────────────────────────────────────── */}
        <Route path="/hr/hiring" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'hr']}>
            <HiringDashboard />
          </ProtectedRoute>
        } />
        <Route path="/hr/hiring/jobs" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'hr']}>
            <JobsPage />
          </ProtectedRoute>
        } />
        <Route path="/hr/hiring/candidates" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'hr']}>
            <CandidatesPage />
          </ProtectedRoute>
        } />
        <Route path="/hr/hiring/candidates/:id" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'hr']}>
            <CandidateProfile />
          </ProtectedRoute>
        } />
        <Route path="/hr/hiring/pipeline" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'hr']}>
            <HiringPipeline />
          </ProtectedRoute>
        } />
        <Route path="/hr/hiring/interviews" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'hr']}>
            <InterviewScheduler />
          </ProtectedRoute>
        } />

        {/* ── Payroll module routes ─────────────────────────────────── */}
        <Route path="/hr/payroll" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'hr']}>
            <HRPayrollDashboard />
          </ProtectedRoute>
        } />
        <Route path="/hr/salary" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'hr']}>
            <SalaryManagement />
          </ProtectedRoute>
        } />
        <Route path="/hr/bank-details" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'hr']}>
            <EmployeeBankDetailsPage />
          </ProtectedRoute>
        } />
        <Route path="/payslips" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'hr', 'manager', 'employee']}>
            <PayslipViewer />
          </ProtectedRoute>
        } />

        {/* ── Role Management ──────────────────────────────────────── */}
        <Route path="/role-management" element={
          <ProtectedRoute requiredRoles={['founder']}>
            <RoleManagementPage />
          </ProtectedRoute>
        } />

        {/* ── Remote Control ───────────────────────────────────────── */}
        <Route path="/remote-control" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'manager']}>
            <RemoteControlPage />
          </ProtectedRoute>
        } />

        {/* ── Activity Tracking module ──────────────────────────────── */}
        <Route path="/activity-monitor" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'hr']}>
            <ActivityMonitorDashboard />
          </ProtectedRoute>
        } />
        <Route path="/daily-report" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'manager', 'hr', 'employee']}>
            <DailyReportPage />
          </ProtectedRoute>
        } />
        <Route path="/activity-logs" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'manager', 'hr', 'employee']}>
            <ActivityLogsPage />
          </ProtectedRoute>
        } />
        <Route path="/time-tracking" element={
          <ProtectedRoute requiredRoles={['founder', 'admin', 'manager', 'hr', 'employee']}>
            <TimeTrackingPage />
          </ProtectedRoute>
        } />

        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
