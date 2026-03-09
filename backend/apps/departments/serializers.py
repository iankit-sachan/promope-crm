from rest_framework import serializers
from .models import Department


class DepartmentSerializer(serializers.ModelSerializer):
    employee_count = serializers.IntegerField(read_only=True)
    active_tasks_count = serializers.IntegerField(read_only=True)
    head_name = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = [
            'id', 'name', 'description', 'head', 'head_name',
            'color', 'employee_count', 'active_tasks_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_head_name(self, obj):
        return obj.head.full_name if obj.head else None


class DepartmentDetailSerializer(DepartmentSerializer):
    """Extended with employee and task lists."""
    employees = serializers.SerializerMethodField()
    recent_tasks = serializers.SerializerMethodField()

    class Meta(DepartmentSerializer.Meta):
        fields = DepartmentSerializer.Meta.fields + ['employees', 'recent_tasks']

    def get_employees(self, obj):
        from apps.employees.serializers import EmployeeListSerializer
        return EmployeeListSerializer(
            obj.employees.filter(status='active').select_related('user'),
            many=True,
            context=self.context,
        ).data

    def get_recent_tasks(self, obj):
        from apps.tasks.serializers import TaskListSerializer
        tasks = obj.tasks.order_by('-created_at')[:10]
        return TaskListSerializer(tasks, many=True, context=self.context).data
