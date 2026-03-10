from django.contrib import admin
from .models import DailyReport


@admin.register(DailyReport)
class DailyReportAdmin(admin.ModelAdmin):
    list_display = ['employee', 'report_date', 'hours_worked', 'status', 'reviewed_by', 'created_at']
    list_filter = ['status', 'report_date', 'employee__department']
    search_fields = ['employee__full_name', 'employee__employee_id', 'work_description']
    readonly_fields = ['created_at', 'updated_at', 'reviewed_at']
    ordering = ['-report_date', '-created_at']
