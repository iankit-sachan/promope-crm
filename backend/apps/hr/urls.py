"""
HR module URL configuration.
All paths are prefixed with /api/hr/ from config/urls.py
"""

from django.urls import path
from . import views

urlpatterns = [
    # Dashboard
    path('dashboard/', views.hr_dashboard, name='hr-dashboard'),

    # Leave management
    path('leave/',                  views.LeaveListCreateView.as_view(), name='hr-leave-list'),
    path('leave/balances/',         views.leave_balance_view,            name='hr-leave-balances'),
    path('leave/<int:pk>/',         views.LeaveDetailView.as_view(),     name='hr-leave-detail'),
    path('leave/<int:pk>/approve/', views.approve_leave,                 name='hr-leave-approve'),
    path('leave/<int:pk>/reject/',  views.reject_leave,                  name='hr-leave-reject'),

    # Attendance (HR view)
    path('attendance/',         views.HRAttendanceView.as_view(), name='hr-attendance-list'),
    path('attendance/export/',  views.attendance_export_view,     name='hr-attendance-export'),

    # Documents
    path('documents/',        views.HRDocumentListCreateView.as_view(), name='hr-document-list'),
    path('documents/<int:pk>/', views.HRDocumentDetailView.as_view(),   name='hr-document-detail'),

    # Performance reports
    path('reports/', views.hr_reports_view, name='hr-reports'),

    # Recruitment
    path('recruitment/',                         views.RecruitmentPositionListCreate.as_view(), name='hr-recruitment-list'),
    path('recruitment/<int:pk>/',                views.RecruitmentPositionDetail.as_view(),     name='hr-recruitment-detail'),
    path('recruitment/<int:pk>/applicants/',     views.ApplicantListCreate.as_view(),           name='hr-applicants-list'),
    path('recruitment/applicants/<int:pk>/',     views.ApplicantDetail.as_view(),               name='hr-applicant-detail'),

    # ── Payroll & Salary ──────────────────────────────────────────────────
    path('payroll/',                    views.payroll_dashboard,                name='hr-payroll-dashboard'),

    # Salary structures
    path('salaries/',                   views.SalaryListCreateView.as_view(),   name='hr-salary-list'),
    path('salaries/<int:pk>/',          views.SalaryDetailView.as_view(),       name='hr-salary-detail'),

    # Bank details
    path('bank-details/',                  views.BankDetailsListCreateView.as_view(), name='hr-bank-list'),
    path('bank-details/export/',           views.bank_details_export,                 name='hr-bank-export'),
    path('bank-details/<int:pk>/',         views.BankDetailsDetailView.as_view(),     name='hr-bank-detail'),
    path('bank-details/<int:pk>/review/',  views.bank_details_review,                 name='hr-bank-review'),
    path('bank-details/<int:pk>/history/', views.bank_details_change_logs,            name='hr-bank-history'),

    # Salary payments
    path('payments/',                   views.PaymentListCreateView.as_view(),  name='hr-payment-list'),
    path('payments/<int:pk>/',          views.PaymentDetailView.as_view(),      name='hr-payment-detail'),

    # Payslips — 'generate/' must come before '<int:pk>/download/'
    path('payslips/',                   views.PayslipListView.as_view(),        name='hr-payslip-list'),
    path('payslips/generate/',          views.generate_payslip,                 name='hr-payslip-generate'),
    path('payslips/<int:pk>/download/', views.payslip_download,                 name='hr-payslip-download'),

    # ── Hiring Module ─────────────────────────────────────────────────────
    path('hiring/dashboard/',              views.hiring_dashboard,                     name='hiring-dashboard'),
    path('hiring/pipeline/',               views.hiring_pipeline_view,                 name='hiring-pipeline'),
    path('jobs/',                          views.JobPositionListCreate.as_view(),      name='job-list'),
    path('jobs/<int:pk>/',                 views.JobPositionDetail.as_view(),          name='job-detail'),
    path('candidates/',                    views.CandidateListCreate.as_view(),        name='candidate-list'),
    path('candidates/<int:pk>/',           views.CandidateDetail.as_view(),            name='candidate-detail'),
    path('candidates/<int:pk>/stage/',     views.update_candidate_stage,               name='candidate-stage'),
    path('candidates/<int:pk>/convert/',   views.convert_to_employee,                  name='candidate-convert'),
    path('interviews/',                    views.InterviewListCreate.as_view(),        name='interview-list'),
    path('interviews/<int:pk>/',           views.InterviewDetail.as_view(),            name='interview-detail'),
    path('evaluations/',                   views.EvaluationListCreate.as_view(),       name='eval-list'),
    path('evaluations/<int:pk>/',          views.EvaluationDetail.as_view(),           name='eval-detail'),
    path('candidate-documents/',           views.CandidateDocumentListCreate.as_view(), name='doc-list'),
    path('candidate-documents/<int:pk>/',  views.CandidateDocumentDetail.as_view(),    name='doc-detail'),

    # ── HR Task Assignment ─────────────────────────────────────────────────────
    path('tasks/stats/',       views.hr_task_stats,                    name='hr-task-stats'),
    path('tasks/',             views.HRTaskListCreateView.as_view(),   name='hr-task-list'),
    path('tasks/<int:pk>/',    views.HRTaskDetailView.as_view(),       name='hr-task-detail'),
]
