from django.contrib import admin
from .models import Employee


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ['employee_id', 'full_name', 'email', 'department', 'role', 'status', 'joining_date']
    list_filter = ['status', 'department']
    search_fields = ['full_name', 'email', 'employee_id']
    ordering = ['full_name']
