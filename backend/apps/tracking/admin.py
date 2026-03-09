from django.contrib import admin
from .models import DailyWorkReport, TaskTimeLog


@admin.register(DailyWorkReport)
class DailyWorkReportAdmin(admin.ModelAdmin):
    list_display  = ['employee', 'report_date', 'status', 'tasks_completed', 'hours_worked', 'reviewed_by']
    list_filter   = ['status', 'report_date', 'employee__department']
    search_fields = ['employee__user__first_name', 'employee__user__last_name']
    ordering      = ['-report_date']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(TaskTimeLog)
class TaskTimeLogAdmin(admin.ModelAdmin):
    list_display  = ['employee', 'task', 'start_time', 'end_time', 'duration_minutes', 'is_active']
    list_filter   = ['is_active', 'employee__department']
    search_fields = ['employee__user__first_name', 'task__name']
    ordering      = ['-start_time']
    readonly_fields = ['created_at', 'updated_at']
