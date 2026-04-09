"""
Employee views - CRUD + activity and task history per employee.
"""

from django.db.models import Q
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import Employee
from .serializers import (
    EmployeeListSerializer, EmployeeDetailSerializer, EmployeeCreateSerializer
)
from apps.authentication.permissions import IsAdminOrAbove, IsManagerOrAbove, IsFounder
from apps.activity.utils import log_activity
from apps.activity.models import ActivityLog
from apps.activity.serializers import ActivityLogSerializer
from apps.tasks.models import Task


class EmployeeListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/employees/         - List all employees (manager+)
    POST /api/employees/         - Create employee (admin+)
    Supports: search, filter by department/status, ordering.
    """
    permission_classes = [IsAuthenticated, IsManagerOrAbove]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['department', 'status']
    search_fields = ['full_name', 'email', 'employee_id', 'role']
    ordering_fields = ['full_name', 'joining_date', 'created_at']
    ordering = ['full_name']

    def get_queryset(self):
        return Employee.objects.select_related(
            'user', 'department'
        ).prefetch_related('assigned_tasks').all()

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return EmployeeCreateSerializer
        return EmployeeListSerializer

    def perform_create(self, serializer):
        employee = serializer.save()
        log_activity(
            actor=self.request.user,
            verb='employee_added',
            description=f'{self.request.user.full_name} added employee {employee.full_name}',
            target_type='employee',
            target_id=employee.id,
            target_name=employee.full_name,
        )


class EmployeeDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/employees/{id}/  - Get employee detail
    PUT    /api/employees/{id}/  - Update employee
    DELETE /api/employees/{id}/  - Delete employee (admin+)
    """
    permission_classes = [IsAuthenticated, IsManagerOrAbove]
    queryset = Employee.objects.select_related('user', 'department').all()

    def get_serializer_class(self):
        if self.request.method in ['PUT', 'PATCH']:
            return EmployeeDetailSerializer
        return EmployeeDetailSerializer

    def perform_update(self, serializer):
        employee = serializer.save()
        log_activity(
            actor=self.request.user,
            verb='employee_updated',
            description=f'{self.request.user.full_name} updated employee {employee.full_name}',
            target_type='employee',
            target_id=employee.id,
            target_name=employee.full_name,
        )

    def perform_destroy(self, instance):
        name = instance.full_name
        # Deactivate the linked User account so they can't login
        user_account = instance.user
        user_account.is_active = False
        user_account.is_online = False
        user_account.save(update_fields=['is_active', 'is_online'])

        log_activity(
            actor=self.request.user,
            verb='employee_deleted',
            description=f'{self.request.user.full_name} removed employee {name}',
            target_type='employee',
            target_name=name,
        )
        instance.delete()

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_admin_or_above:
            return Response(
                {'detail': 'Only admins can delete employees.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAbove])
def employee_activity_view(request, pk):
    """
    GET /api/employees/{id}/activity/
    Returns the activity log for a specific employee.
    """
    try:
        employee = Employee.objects.get(pk=pk)
    except Employee.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    logs = ActivityLog.objects.filter(actor=employee.user).order_by('-created_at')[:50]
    serializer = ActivityLogSerializer(logs, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAbove])
def employee_tasks_view(request, pk):
    """
    GET /api/employees/{id}/tasks/
    Returns all tasks for a specific employee.
    """
    try:
        employee = Employee.objects.get(pk=pk)
    except Employee.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    from apps.tasks.serializers import TaskListSerializer
    tasks = Task.objects.filter(assigned_to=employee).order_by('-created_at')
    serializer = TaskListSerializer(tasks, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def active_employees_view(request):
    """
    GET /api/employees/active-today/
    Returns employees who have been online today.
    """
    from django.utils import timezone
    today = timezone.now().date()
    employees = Employee.objects.filter(
        user__last_seen__date=today,
        status='active',
    ).select_related('user', 'department')
    serializer = EmployeeListSerializer(employees, many=True)
    return Response({'count': employees.count(), 'results': serializer.data})


# ── Role Management ──────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsFounder])
def role_management_list(request):
    """
    GET /api/employees/role-management/
    Returns all employees and HR users (excludes founder/admin/manager).
    Only accessible by Founder.
    """
    from django.shortcuts import get_list_or_404
    employees = Employee.objects.filter(
        user__role__in=['employee', 'hr']
    ).select_related('user', 'department').order_by('full_name')

    data = []
    for emp in employees:
        data.append({
            'id': emp.id,
            'employee_id': emp.employee_id,
            'full_name': emp.full_name,
            'email': emp.email,
            'department': emp.department.name if emp.department else None,
            'role': emp.user.role,
        })
    return Response(data)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated, IsFounder])
def assign_hr(request, pk):
    """
    PATCH /api/employees/{pk}/assign-hr/
    Promotes an employee to the HR role. Only Founder can call this.
    """
    from django.shortcuts import get_object_or_404
    employee = get_object_or_404(Employee, pk=pk)
    if employee.user.role != 'employee':
        return Response(
            {'error': 'Only employees can be assigned the HR role.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    employee.user.role = 'hr'
    employee.user.save(update_fields=['role'])
    log_activity(
        actor=request.user,
        verb='role_change',
        description=f'{request.user.full_name} assigned HR role to {employee.full_name}',
        target_type='employee',
        target_id=employee.id,
        target_name=employee.full_name,
    )
    return Response({'message': f'{employee.full_name} is now an HR.', 'role': 'hr'})


@api_view(['PATCH'])
@permission_classes([IsAuthenticated, IsFounder])
def remove_hr(request, pk):
    """
    PATCH /api/employees/{pk}/remove-hr/
    Demotes an HR user back to Employee. Only Founder can call this.
    """
    from django.shortcuts import get_object_or_404
    employee = get_object_or_404(Employee, pk=pk)
    if employee.user.role != 'hr':
        return Response(
            {'error': 'User does not have the HR role.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    employee.user.role = 'employee'
    employee.user.save(update_fields=['role'])
    log_activity(
        actor=request.user,
        verb='role_change',
        description=f'{request.user.full_name} removed HR role from {employee.full_name}',
        target_type='employee',
        target_id=employee.id,
        target_name=employee.full_name,
    )
    return Response({'message': f'{employee.full_name} is now an Employee.', 'role': 'employee'})
