from django.urls import path
from . import views

urlpatterns = [
    # Daily Work Reports
    path('reports/',                  views.DailyReportListCreateView.as_view(), name='tracking-report-list'),
    path('reports/summary/',          views.report_summary,                      name='tracking-report-summary'),
    path('reports/<int:pk>/',         views.DailyReportDetailView.as_view(),     name='tracking-report-detail'),
    path('reports/<int:pk>/review/',  views.review_daily_report,                 name='tracking-report-review'),

    # Task Time Tracking
    path('timers/',                   views.TaskTimerListCreateView.as_view(),   name='tracking-timer-list'),
    path('timers/summary/',           views.timer_summary,                       name='tracking-timer-summary'),
    path('timers/<int:pk>/stop/',     views.stop_timer,                          name='tracking-timer-stop'),

    # Dashboards
    path('productivity/',             views.productivity_dashboard,              name='tracking-productivity'),
    path('online-users/',             views.online_users,                        name='tracking-online-users'),
]
