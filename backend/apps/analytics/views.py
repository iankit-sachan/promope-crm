"""
Analytics views - aggregated stats for charts and the founder dashboard.
All endpoints require manager+ permission.
"""

from datetime import timedelta
from django.db.models import Count, Q, Avg, F
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.employees.models import Employee
from apps.tasks.models import Task
from apps.departments.models import Department
from apps.activity.models import ActivityLog
from apps.attendance.models import AttendanceLog
from apps.authentication.permissions import IsManagerOrAbove


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAbove])
def dashboard_stats(request):
    """
    GET /api/analytics/dashboard/
    Returns all KPI widgets for the founder dashboard.
    """
    now = timezone.now()
    today = now.date()
    week_ago = today - timedelta(days=7)

    # Employee stats
    total_employees = Employee.objects.filter(status='active').count()
    # Use AttendanceLog (actual daily check-ins) rather than User.last_seen, which
    # is bumped on every API call and does not reflect genuine attendance.
    active_today = AttendanceLog.objects.filter(
        date=today,
        status__in=['present', 'late', 'half_day'],
    ).values('employee').distinct().count()

    # Task stats
    tasks_qs = Task.objects.all()
    total_tasks = tasks_qs.count()
    pending_tasks = tasks_qs.filter(status='pending').count()
    in_progress_tasks = tasks_qs.filter(status='in_progress').count()
    completed_tasks = tasks_qs.filter(status='completed').count()
    delayed_tasks = tasks_qs.filter(status='delayed').count()

    # Overdue (deadline passed, not completed/cancelled)
    overdue_tasks = tasks_qs.filter(
        deadline__lt=today,
        status__in=['pending', 'in_progress'],
    ).count()

    # Tasks completed this week
    completed_this_week = tasks_qs.filter(
        status='completed',
        completed_at__date__gte=week_ago,
    ).count()

    # Departments overview — distinct=True prevents cartesian product when
    # Django joins both the employees and tasks relations in one annotate().
    dept_stats = Department.objects.annotate(
        emp_count=Count('employees', filter=Q(employees__status='active'), distinct=True),
        active_task_count=Count('tasks', filter=Q(tasks__status__in=['pending', 'in_progress']), distinct=True),
        completed_task_count=Count('tasks', filter=Q(tasks__status='completed'), distinct=True),
    ).values('id', 'name', 'color', 'emp_count', 'active_task_count', 'completed_task_count')

    return Response({
        'employees': {
            'total': total_employees,
            'active_today': active_today,
            'inactive': total_employees - active_today,
        },
        'tasks': {
            'total': total_tasks,
            'pending': pending_tasks,
            'in_progress': in_progress_tasks,
            'completed': completed_tasks,
            'delayed': delayed_tasks,
            'overdue': overdue_tasks,
            'completed_this_week': completed_this_week,
        },
        'departments': list(dept_stats),
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAbove])
def tasks_over_time(request):
    """
    GET /api/analytics/tasks-over-time/?days=30
    Returns tasks completed per day for the given period.
    Used for the line chart on the dashboard.
    """
    days = int(request.query_params.get('days', 30))
    start_date = timezone.now().date() - timedelta(days=days)

    result = []
    current = start_date
    end_date = timezone.now().date()

    # Pre-fetch data
    completed_by_date = {}
    qs = Task.objects.filter(
        status='completed',
        completed_at__date__gte=start_date,
    ).values('completed_at__date').annotate(count=Count('id'))

    for row in qs:
        completed_by_date[str(row['completed_at__date'])] = row['count']

    created_by_date = {}
    qs2 = Task.objects.filter(
        created_at__date__gte=start_date,
    ).values('created_at__date').annotate(count=Count('id'))
    for row in qs2:
        created_by_date[str(row['created_at__date'])] = row['count']

    while current <= end_date:
        date_str = str(current)
        result.append({
            'date': date_str,
            'completed': completed_by_date.get(date_str, 0),
            'created': created_by_date.get(date_str, 0),
        })
        current += timedelta(days=1)

    return Response(result)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAbove])
def tasks_by_department(request):
    """
    GET /api/analytics/tasks-by-department/
    Returns task counts grouped by department.
    Used for the bar/pie chart.
    """
    data = Department.objects.annotate(
        pending=Count('tasks', filter=Q(tasks__status='pending')),
        in_progress=Count('tasks', filter=Q(tasks__status='in_progress')),
        completed=Count('tasks', filter=Q(tasks__status='completed')),
        delayed=Count('tasks', filter=Q(tasks__status='delayed')),
        total=Count('tasks'),
    ).values('id', 'name', 'color', 'pending', 'in_progress', 'completed', 'delayed', 'total')

    return Response(list(data))


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAbove])
def employee_productivity(request):
    """
    GET /api/analytics/employee-productivity/
    Returns productivity scores for all employees.
    """
    employees = Employee.objects.filter(status='active').annotate(
        total_tasks=Count('assigned_tasks'),
        completed_count=Count('assigned_tasks', filter=Q(assigned_tasks__status='completed')),
    ).select_related('department')

    result = []
    for emp in employees:
        score = round(
            (emp.completed_count / emp.total_tasks * 100) if emp.total_tasks > 0 else 0, 1
        )
        result.append({
            'id': emp.id,
            'name': emp.full_name,
            'department': emp.department.name if emp.department else 'Unassigned',
            'total_tasks': emp.total_tasks,
            'completed': emp.completed_count,
            'productivity_score': score,
        })

    result.sort(key=lambda x: x['productivity_score'], reverse=True)
    return Response(result)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAbove])
def tasks_by_priority(request):
    """
    GET /api/analytics/tasks-by-priority/
    Returns task counts grouped by priority.
    """
    data = Task.objects.values('priority').annotate(
        count=Count('id'),
        completed=Count('id', filter=Q(status='completed')),
    ).order_by('priority')

    return Response(list(data))


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAbove])
def completion_rate(request):
    """
    GET /api/analytics/completion-rate/
    Overall task completion rate as a percentage.
    """
    total = Task.objects.count()
    completed = Task.objects.filter(status='completed').count()
    rate = round((completed / total * 100), 1) if total > 0 else 0
    return Response({
        'total': total,
        'completed': completed,
        'rate': rate,
    })
