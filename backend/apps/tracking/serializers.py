"""
Serializers for the tracking app.
"""

from rest_framework import serializers
from django.utils import timezone

from .models import DailyWorkReport, TaskTimeLog


class DailyWorkReportSerializer(serializers.ModelSerializer):
    # Read-only employee info
    employee_name   = serializers.SerializerMethodField()
    employee_code   = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()
    completion_rate = serializers.SerializerMethodField()

    class Meta:
        model  = DailyWorkReport
        fields = [
            'id', 'employee', 'employee_name', 'employee_code', 'department_name',
            'report_date',
            'tasks_assigned', 'tasks_completed', 'tasks_pending', 'hours_worked',
            'work_description', 'blockers', 'plan_for_tomorrow',
            'status', 'reviewed_by', 'reviewed_by_name', 'review_comment', 'reviewed_at',
            'completion_rate',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'employee', 'reviewed_by', 'reviewed_at', 'created_at', 'updated_at',
        ]

    def get_employee_name(self, obj):
        return obj.employee.full_name if obj.employee else ''

    def get_employee_code(self, obj):
        return obj.employee.employee_id if obj.employee else ''

    def get_department_name(self, obj):
        return obj.employee.department.name if obj.employee and obj.employee.department else ''

    def get_reviewed_by_name(self, obj):
        return obj.reviewed_by.full_name if obj.reviewed_by else ''

    def get_completion_rate(self, obj):
        return obj.completion_rate


class TaskTimeLogSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    task_title    = serializers.SerializerMethodField()
    task_id_code  = serializers.SerializerMethodField()
    elapsed_minutes = serializers.SerializerMethodField()

    class Meta:
        model  = TaskTimeLog
        fields = [
            'id', 'employee', 'employee_name',
            'task', 'task_title', 'task_id_code',
            'start_time', 'end_time', 'duration_minutes', 'elapsed_minutes',
            'notes', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'employee', 'end_time', 'duration_minutes', 'is_active',
            'created_at', 'updated_at',
        ]

    def get_employee_name(self, obj):
        return obj.employee.full_name if obj.employee else ''

    def get_task_title(self, obj):
        return obj.task.name if obj.task else ''

    def get_task_id_code(self, obj):
        return obj.task.task_id if obj.task else ''

    def get_elapsed_minutes(self, obj):
        return obj.elapsed_minutes
