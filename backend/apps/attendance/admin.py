from django.contrib import admin
from .models import AttendanceLog, UserPresence


@admin.register(AttendanceLog)
class AttendanceLogAdmin(admin.ModelAdmin):
    list_display  = ['employee', 'date', 'status', 'login_time', 'logout_time', 'total_work_hours']
    list_filter   = ['status', 'date']
    search_fields = ['employee__full_name', 'employee__employee_id']
    date_hierarchy = 'date'
    readonly_fields = ['total_work_hours']


@admin.register(UserPresence)
class UserPresenceAdmin(admin.ModelAdmin):
    list_display  = ['user', 'status', 'last_active', 'session_start']
    list_filter   = ['status']
    search_fields = ['user__full_name', 'user__email']
    readonly_fields = ['last_active']
