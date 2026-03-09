"""
Serializers for DailyWorkLog — read/write + computed aggregations.
"""

from rest_framework import serializers
from .models import DailyWorkLog
from apps.tasks.models import Task


class TaskMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = ['id', 'task_id', 'name', 'status', 'priority', 'progress']


class DailyWorkLogSerializer(serializers.ModelSerializer):
    """Full serializer used for create/update/detail."""

    employee_name        = serializers.CharField(source='employee.full_name',    read_only=True)
    employee_code        = serializers.CharField(source='employee.employee_id',  read_only=True)
    department_name      = serializers.CharField(source='employee.department.name', read_only=True, default=None)

    tasks_assigned_count   = serializers.IntegerField(read_only=True)
    tasks_completed_count  = serializers.IntegerField(read_only=True)
    tasks_pending_count    = serializers.IntegerField(read_only=True)
    tasks_blocked_count    = serializers.IntegerField(read_only=True)
    completion_rate        = serializers.FloatField(read_only=True)

    tasks_assigned_detail  = TaskMinimalSerializer(source='tasks_assigned',  many=True, read_only=True)
    tasks_completed_detail = TaskMinimalSerializer(source='tasks_completed', many=True, read_only=True)
    tasks_blocked_detail   = TaskMinimalSerializer(source='tasks_blocked',   many=True, read_only=True)

    class Meta:
        model = DailyWorkLog
        fields = [
            'id', 'employee', 'employee_name', 'employee_code', 'department_name',
            'date', 'work_description', 'hours_worked', 'status',
            'tasks_assigned',         'tasks_assigned_detail',
            'tasks_completed',        'tasks_completed_detail',
            'tasks_blocked',          'tasks_blocked_detail',
            'tasks_assigned_count',   'tasks_completed_count',
            'tasks_pending_count',    'tasks_blocked_count',
            'completion_rate',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class DailyWorkLogListSerializer(serializers.ModelSerializer):
    """Compact serializer for list views."""

    employee_name   = serializers.CharField(source='employee.full_name',   read_only=True)
    employee_code   = serializers.CharField(source='employee.employee_id', read_only=True)
    department_name = serializers.CharField(source='employee.department.name', read_only=True, default=None)
    profile_photo   = serializers.SerializerMethodField()

    tasks_assigned_count  = serializers.IntegerField(read_only=True)
    tasks_completed_count = serializers.IntegerField(read_only=True)
    tasks_pending_count   = serializers.IntegerField(read_only=True)
    completion_rate       = serializers.FloatField(read_only=True)

    class Meta:
        model = DailyWorkLog
        fields = [
            'id', 'employee', 'employee_name', 'employee_code',
            'department_name', 'profile_photo',
            'date', 'work_description', 'hours_worked', 'status',
            'tasks_assigned_count', 'tasks_completed_count',
            'tasks_pending_count', 'completion_rate',
            'created_at', 'updated_at',
        ]

    def get_profile_photo(self, obj):
        if obj.employee.profile_photo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.employee.profile_photo.url)
        return None
