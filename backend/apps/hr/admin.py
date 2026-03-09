from django.contrib import admin
from .models import LeaveRequest, LeaveBalance, HRDocument, RecruitmentPosition, Applicant


@admin.register(LeaveRequest)
class LeaveRequestAdmin(admin.ModelAdmin):
    list_display = ['employee', 'leave_type', 'start_date', 'end_date', 'status', 'created_at']
    list_filter = ['status', 'leave_type']
    search_fields = ['employee__full_name']
    ordering = ['-created_at']


@admin.register(LeaveBalance)
class LeaveBalanceAdmin(admin.ModelAdmin):
    list_display = ['employee', 'leave_type', 'year', 'total_days', 'used_days']
    list_filter = ['leave_type', 'year']
    search_fields = ['employee__full_name']


@admin.register(HRDocument)
class HRDocumentAdmin(admin.ModelAdmin):
    list_display = ['employee', 'doc_type', 'title', 'status', 'created_at']
    list_filter = ['status', 'doc_type']
    search_fields = ['employee__full_name', 'title']


@admin.register(RecruitmentPosition)
class RecruitmentPositionAdmin(admin.ModelAdmin):
    list_display = ['title', 'department', 'status', 'openings', 'created_at']
    list_filter = ['status']
    search_fields = ['title']


@admin.register(Applicant)
class ApplicantAdmin(admin.ModelAdmin):
    list_display = ['full_name', 'email', 'position', 'status', 'applied_at']
    list_filter = ['status']
    search_fields = ['full_name', 'email']
