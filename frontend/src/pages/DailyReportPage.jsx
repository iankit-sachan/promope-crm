/**
 * DailyReportPage
 *
 * HR / Admin / Founder / Manager → ReportsDashboard (review all reports)
 * Employee → DailyReportForm + MyReports (submit & view own history)
 */

import { useAuthStore } from '../store/authStore'
import ReportsDashboard from '../components/daily-reports/ReportsDashboard'
import DailyReportForm  from '../components/daily-reports/DailyReportForm'
import MyReports        from '../components/daily-reports/MyReports'

export default function DailyReportPage() {
  const { user } = useAuthStore()
  const isReviewer = ['founder', 'admin', 'hr', 'manager'].includes(user?.role)

  if (isReviewer) {
    return <ReportsDashboard />
  }

  return (
    <div className="space-y-6">
      <DailyReportForm />
      <MyReports />
    </div>
  )
}
