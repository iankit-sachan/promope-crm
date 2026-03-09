from django.contrib import admin
from .models import DailyWorkLog


@admin.register(DailyWorkLog)
class DailyWorkLogAdmin(admin.ModelAdmin):
    list_display = ['employee', 'date', 'hours_worked', 'status', 'created_at']
    list_filter = ['status', 'date', 'employee__department']
    search_fields = ['employee__full_name', 'employee__employee_id', 'work_description']
    date_hierarchy = 'date'
    ordering = ['-date']
    filter_horizontal = ['tasks_assigned', 'tasks_completed', 'tasks_blocked']
