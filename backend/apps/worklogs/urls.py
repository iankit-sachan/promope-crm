from django.urls import path
from . import views

urlpatterns = [
    # Work log CRUD
    path('',        views.DailyWorkLogListCreateView.as_view(), name='worklog-list-create'),
    path('today/',  views.today_worklog_view,                   name='worklog-today'),
    path('<int:pk>/', views.DailyWorkLogDetailView.as_view(),   name='worklog-detail'),
]

# Report URLs are registered separately under /api/reports/ in config/urls.py
report_urlpatterns = [
    path('daily/',   views.daily_report_view,      name='report-daily'),
    path('weekly/',  views.weekly_report_view,      name='report-weekly'),
    path('monthly/', views.monthly_report_view,     name='report-monthly'),
    path('trend/',   views.completion_trend_view,   name='report-trend'),
]
