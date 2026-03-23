from django.urls import path
from . import views

urlpatterns = [
    path('', views.DailyReportListCreateView.as_view(), name='daily-report-list-create'),
    path('my-reports/', views.MyReportsView.as_view(), name='daily-report-my-reports'),
    path('all/', views.AllReportsView.as_view(), name='daily-report-all'),
    path('analytics/', views.daily_report_analytics, name='daily-report-analytics'),
    path('attachments/<int:pk>/', views.delete_attachment, name='daily-report-attachment-delete'),
    path('<int:pk>/', views.DailyReportDetailView.as_view(), name='daily-report-detail'),
    path('<int:pk>/submit/', views.submit_report, name='daily-report-submit'),
    path('<int:pk>/review/', views.review_report, name='daily-report-review'),
]
