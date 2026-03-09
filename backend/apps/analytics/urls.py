from django.urls import path
from . import views

urlpatterns = [
    path('dashboard/', views.dashboard_stats, name='analytics-dashboard'),
    path('tasks-over-time/', views.tasks_over_time, name='analytics-tasks-over-time'),
    path('tasks-by-department/', views.tasks_by_department, name='analytics-tasks-by-department'),
    path('employee-productivity/', views.employee_productivity, name='analytics-employee-productivity'),
    path('tasks-by-priority/', views.tasks_by_priority, name='analytics-tasks-by-priority'),
    path('completion-rate/', views.completion_rate, name='analytics-completion-rate'),
]
