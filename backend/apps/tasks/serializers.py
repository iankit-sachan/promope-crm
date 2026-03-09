"""
Task serializers - list, detail, create, update with nested relations.
"""

from rest_framework import serializers
from .models import Task, TaskComment, TaskAttachment, TaskHistory
from apps.employees.models import Employee


class EmployeeMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = ['id', 'employee_id', 'full_name', 'profile_photo']


class TaskCommentSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.full_name', read_only=True)

    class Meta:
        model = TaskComment
        fields = ['id', 'author', 'author_name', 'content', 'created_at', 'updated_at']
        read_only_fields = ['author', 'created_at', 'updated_at']


class TaskAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.full_name', read_only=True)

    class Meta:
        model = TaskAttachment
        fields = ['id', 'filename', 'file', 'file_size', 'uploaded_by', 'uploaded_by_name', 'uploaded_at']
        read_only_fields = ['uploaded_by', 'uploaded_at']


class TaskHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.CharField(source='changed_by.full_name', read_only=True)

    class Meta:
        model = TaskHistory
        fields = ['id', 'field_name', 'old_value', 'new_value',
                  'changed_by', 'changed_by_name', 'changed_at', 'note']
        read_only_fields = ['changed_at']


class TaskListSerializer(serializers.ModelSerializer):
    """Compact serializer for task tables and lists."""
    assigned_to_name = serializers.CharField(source='assigned_to.full_name', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    comments_count = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            'id', 'task_id', 'name', 'description',
            'assigned_to', 'assigned_to_name',
            'department', 'department_name',
            'priority', 'status', 'progress',
            'start_date', 'deadline', 'completed_at',
            'is_overdue', 'comments_count', 'created_at',
            'expected_hours',
        ]

    def get_comments_count(self, obj):
        return obj.comments.count()


class TaskDetailSerializer(serializers.ModelSerializer):
    """Full detail serializer with nested comments, attachments, history."""
    assigned_to_detail = EmployeeMinimalSerializer(source='assigned_to', read_only=True)
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=Employee.objects.all(),
        allow_null=True,
        required=False,
    )
    comments = TaskCommentSerializer(many=True, read_only=True)
    attachments = TaskAttachmentSerializer(many=True, read_only=True)
    history = TaskHistorySerializer(many=True, read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)

    class Meta:
        model = Task
        fields = [
            'id', 'task_id', 'name', 'description',
            'assigned_to', 'assigned_to_detail',
            'assigned_by', 'department', 'department_name',
            'priority', 'status', 'progress',
            'start_date', 'deadline', 'completed_at', 'is_overdue',
            'comments', 'attachments', 'history',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['task_id', 'assigned_by', 'created_at', 'updated_at', 'completed_at']


class TaskCreateSerializer(serializers.ModelSerializer):
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=Employee.objects.all(),
        allow_null=True,
        required=False,
    )

    class Meta:
        model = Task
        fields = [
            'name', 'description', 'assigned_to', 'department',
            'priority', 'status', 'start_date', 'deadline', 'progress',
            'expected_hours',
        ]

    def create(self, validated_data):
        request = self.context.get('request')
        task = Task.objects.create(
            assigned_by=request.user if request else None,
            **validated_data,
        )
        return task


class TaskProgressUpdateSerializer(serializers.Serializer):
    """Used specifically for progress/status updates."""
    status = serializers.ChoiceField(choices=Task.Status.choices, required=False)
    progress = serializers.IntegerField(min_value=0, max_value=100, required=False)
    note = serializers.CharField(max_length=255, required=False, allow_blank=True)
