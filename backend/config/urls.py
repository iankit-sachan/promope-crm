"""
Root URL configuration for Staff Management CRM.
"""

from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import RedirectView
from django.http import HttpResponse, FileResponse
from pathlib import Path
from apps.worklogs   import views as worklog_views
from apps.attendance import views as attendance_views
from apps.chat       import views as chat_views


def root_view(request):
    """
    Root URL handler:
    - Development (DEBUG=True): redirect to Vite dev server at :5173
    - Production (DEBUG=False): serve the built React index.html
    """
    if settings.DEBUG:
        return RedirectView.as_view(url='http://localhost:5173/')(request)
    # Production: serve React build
    index = Path(settings.BASE_DIR).parent / 'frontend' / 'dist' / 'index.html'
    if index.exists():
        return FileResponse(open(index, 'rb'), content_type='text/html')
    return HttpResponse(
        '<h2>Frontend not built.</h2><p>Run <code>npm run build</code> inside '
        '<code>frontend/</code> then restart the server.</p>',
        status=503,
    )


urlpatterns = [
    path('', root_view, name='root'),
    path('admin/', admin.site.urls),

    # Authentication
    path('api/auth/', include('apps.authentication.urls')),

    # Core modules
    path('api/employees/',   include('apps.employees.urls')),
    path('api/tasks/',       include('apps.tasks.urls')),
    path('api/departments/', include('apps.departments.urls')),

    # Supporting modules
    path('api/activity/',      include('apps.activity.urls')),
    path('api/notifications/', include('apps.notifications.urls')),
    path('api/analytics/',     include('apps.analytics.urls')),

    # Work logs CRUD
    path('api/worklogs/', include('apps.worklogs.urls')),

    # Work-log report aggregation
    path('api/reports/daily/',   worklog_views.daily_report_view,     name='report-daily'),
    path('api/reports/weekly/',  worklog_views.weekly_report_view,    name='report-weekly'),
    path('api/reports/monthly/', worklog_views.monthly_report_view,   name='report-monthly'),
    path('api/reports/trend/',   worklog_views.completion_trend_view, name='report-trend'),

    # Attendance & Presence (CRUD + presence dashboard)
    # Note: report sub-paths must be declared BEFORE the include() to avoid clash
    path('api/attendance/reports/daily/',   attendance_views.attendance_daily_report,   name='att-report-daily'),
    path('api/attendance/reports/weekly/',  attendance_views.attendance_weekly_report,  name='att-report-weekly'),
    path('api/attendance/reports/monthly/', attendance_views.attendance_monthly_report, name='att-report-monthly'),
    path('api/attendance/', include('apps.attendance.urls')),

    # Chat, file sharing & PDF reports
    path('api/chat/', include('apps.chat.urls')),

    # HR module
    path('api/hr/', include('apps.hr.urls')),

    # Employee Activity Tracking
    path('api/tracking/', include('apps.tracking.urls')),

    # Remote Desktop Control
    path('api/remote/', include('apps.remote_control.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
