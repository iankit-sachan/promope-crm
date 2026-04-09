"""
Employee serializers - list, detail, create, update.
"""

from rest_framework import serializers
from .models import Employee
from apps.authentication.models import User
from apps.departments.models import Department


class DepartmentMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ['id', 'name', 'color']


class EmployeeListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views and tables."""
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    department_color = serializers.CharField(source='department.color', read_only=True)
    is_active_today = serializers.BooleanField(read_only=True)
    is_online = serializers.SerializerMethodField()

    def get_is_online(self, obj):
        from django.utils import timezone
        user = obj.user
        if not user or not user.is_online or user.last_seen is None:
            return False
        return (timezone.now() - user.last_seen).total_seconds() <= 300  # 5 min
    tasks_in_progress = serializers.IntegerField(read_only=True)
    tasks_completed = serializers.IntegerField(read_only=True)
    tasks_pending = serializers.IntegerField(read_only=True)
    productivity_score = serializers.FloatField(read_only=True)
    current_task = serializers.SerializerMethodField()

    class Meta:
        model = Employee
        fields = [
            'id', 'user_id', 'employee_id', 'full_name', 'email', 'phone',
            'department', 'department_name', 'department_color',
            'role', 'status', 'joining_date',
            'profile_photo', 'is_active_today', 'is_online',
            'tasks_in_progress', 'tasks_completed', 'tasks_pending',
            'productivity_score', 'current_task',
        ]

    def get_current_task(self, obj):
        task = obj.assigned_tasks.filter(status='in_progress').first()
        if task:
            return {'id': task.id, 'task_id': task.task_id, 'name': task.name}
        return None


class EmployeeDetailSerializer(serializers.ModelSerializer):
    """Full detail serializer with performance metrics."""
    department = DepartmentMinimalSerializer(read_only=True)
    department_id = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(),
        source='department',
        write_only=True,
        allow_null=True,
        required=False,
    )
    is_active_today = serializers.BooleanField(read_only=True)
    is_online = serializers.SerializerMethodField()
    last_seen = serializers.DateTimeField(source='user.last_seen', read_only=True)

    def get_is_online(self, obj):
        from django.utils import timezone
        user = obj.user
        if not user or not user.is_online or user.last_seen is None:
            return False
        return (timezone.now() - user.last_seen).total_seconds() <= 300  # 5 min
    tasks_completed = serializers.IntegerField(read_only=True)
    tasks_pending = serializers.IntegerField(read_only=True)
    tasks_in_progress = serializers.IntegerField(read_only=True)
    productivity_score = serializers.FloatField(read_only=True)

    class Meta:
        model = Employee
        fields = [
            'id', 'employee_id', 'full_name', 'email', 'phone',
            'department', 'department_id', 'role', 'status',
            'joining_date', 'salary', 'address', 'profile_photo',
            'is_active_today', 'is_online', 'last_seen',
            'tasks_completed', 'tasks_pending', 'tasks_in_progress',
            'productivity_score', 'created_at', 'updated_at',
        ]
        read_only_fields = ['employee_id', 'created_at', 'updated_at']


class EmployeeCreateSerializer(serializers.ModelSerializer):
    """Used when creating a new employee — also creates the User account."""
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    department_id = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(),
        source='department',
        allow_null=True,
        required=False,
    )

    class Meta:
        model = Employee
        fields = [
            'full_name', 'email', 'phone', 'department_id',
            'role', 'joining_date', 'salary', 'address', 'password',
        ]

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return value

    def create(self, validated_data):
        password = validated_data.pop('password')
        email = validated_data['email']
        full_name = validated_data['full_name']

        # Create the auth user
        user = User.objects.create_user(
            email=email,
            password=password,
            full_name=full_name,
            role=User.Role.EMPLOYEE,
        )

        # Generate employee ID
        last_emp = Employee.objects.order_by('-id').first()
        next_id = (last_emp.id + 1) if last_emp else 1
        employee_id = f'EMP-{next_id:04d}'

        employee = Employee.objects.create(
            user=user,
            employee_id=employee_id,
            **validated_data,
        )
        return employee
