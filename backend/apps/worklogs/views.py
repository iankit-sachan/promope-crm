"""
Work log CRUD + daily/weekly/monthly report aggregation views.
"""

import datetime
import calendar
from decimal import Decimal

from django.db.models import Sum, Avg, Count, Q
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import DailyWorkLog
from .serializers import DailyWorkLogSerializer, DailyWorkLogListSerializer
from apps.employees.models import Employee
from apps.tasks.models import Task
from apps.authentication.permissions import IsManagerOrAbove


# ── Work Log CRUD ─────────────────────────────────────────────────────────────

class DailyWorkLogListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/worklogs/  — List logs (manager: all; employee: own)
    POST /api/worklogs/  — Create/submit a work log
    Query params: date, employee, status
    """
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return DailyWorkLogSerializer
        return DailyWorkLogListSerializer

    def get_queryset(self):
        user = self.request.user
        qs = DailyWorkLog.objects.select_related(
            'employee', 'employee__department'
        ).prefetch_related('tasks_assigned', 'tasks_completed', 'tasks_blocked')

        if not user.is_manager_or_above:
            try:
                qs = qs.filter(employee=user.employee_profile)
            except Exception:
                return DailyWorkLog.objects.none()
        else:
            emp_id = self.request.query_params.get('employee')
            if emp_id:
                qs = qs.filter(employee_id=emp_id)

        date = self.request.query_params.get('date')
        if date:
            qs = qs.filter(date=date)

        log_status = self.request.query_params.get('status')
        if log_status:
            qs = qs.filter(status=log_status)

        return qs

    def perform_create(self, serializer):
        user = self.request.user
        if user.is_manager_or_above:
            serializer.save()
        else:
            try:
                serializer.save(employee=user.employee_profile)
            except Exception:
                serializer.save()


class DailyWorkLogDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/worklogs/{id}/
    PATCH  /api/worklogs/{id}/
    DELETE /api/worklogs/{id}/
    """
    permission_classes = [IsAuthenticated]
    serializer_class = DailyWorkLogSerializer

    def get_queryset(self):
        user = self.request.user
        qs = DailyWorkLog.objects.select_related(
            'employee', 'employee__department'
        ).prefetch_related('tasks_assigned', 'tasks_completed', 'tasks_blocked')
        if not user.is_manager_or_above:
            try:
                return qs.filter(employee=user.employee_profile)
            except Exception:
                return DailyWorkLog.objects.none()
        return qs


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def today_worklog_view(request):
    """
    GET /api/worklogs/today/
    Returns today's log for the current employee (creates draft if missing).
    """
    try:
        employee = request.user.employee_profile
    except Exception:
        return Response(None, status=status.HTTP_200_OK)

    today = datetime.date.today()
    log, _ = DailyWorkLog.objects.get_or_create(
        employee=employee,
        date=today,
        defaults={'status': DailyWorkLog.Status.DRAFT},
    )
    serializer = DailyWorkLogSerializer(log, context={'request': request})
    return Response(serializer.data)


# ── Report Aggregation Helpers ────────────────────────────────────────────────

def _employee_day_stats(employee, report_date, log_map):
    """Return stat dict for one employee on one date."""
    log = log_map.get(employee.id)

    if log:
        assigned  = log.tasks_assigned_count
        completed = log.tasks_completed_count
        pending   = log.tasks_pending_count
        blocked   = log.tasks_blocked_count
        hours     = float(log.hours_worked)
        desc      = log.work_description
        submitted = log.status == DailyWorkLog.Status.SUBMITTED
        log_id    = log.id
    else:
        # Fall back to task model data when no log submitted
        emp_tasks  = Task.objects.filter(assigned_to=employee)
        assigned   = emp_tasks.filter(status__in=['pending', 'in_progress']).count()
        completed  = emp_tasks.filter(
            status='completed',
            completed_at__date=report_date,
        ).count()
        pending    = emp_tasks.filter(status='pending').count()
        blocked    = 0
        hours      = 0.0
        desc       = ''
        submitted  = False
        log_id     = None

    rate = round(completed / assigned * 100, 1) if assigned > 0 else 0.0

    return {
        'employee_id':          employee.id,
        'employee_code':        employee.employee_id,
        'employee_name':        employee.full_name,
        'department':           employee.department.name if employee.department else None,
        'hours_worked':         hours,
        'tasks_assigned_count': assigned,
        'tasks_completed_count': completed,
        'tasks_pending_count':  pending,
        'tasks_blocked_count':  blocked,
        'completion_rate':      rate,
        'work_description':     desc,
        'log_submitted':        submitted,
        'log_id':               log_id,
    }


# ── Report Views ──────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsManagerOrAbove])
def daily_report_view(request):
    """
    GET /api/reports/daily/?date=2026-03-05
    Returns per-employee daily summary for the given date.
    """
    date_str = request.query_params.get('date', str(datetime.date.today()))
    try:
        report_date = datetime.date.fromisoformat(date_str)
    except ValueError:
        return Response({'detail': 'Invalid date. Use YYYY-MM-DD.'}, status=400)

    employees = (
        Employee.objects
        .filter(status='active')
        .select_related('department', 'user')
        .order_by('full_name')
    )

    logs = (
        DailyWorkLog.objects
        .filter(date=report_date)
        .select_related('employee')
        .prefetch_related('tasks_assigned', 'tasks_completed', 'tasks_blocked')
    )
    log_map = {log.employee_id: log for log in logs}

    employee_reports = []
    total_assigned  = 0
    total_completed = 0
    total_hours     = 0.0

    for emp in employees:
        stats = _employee_day_stats(emp, report_date, log_map)
        employee_reports.append(stats)
        total_assigned  += stats['tasks_assigned_count']
        total_completed += stats['tasks_completed_count']
        total_hours     += stats['hours_worked']

    employee_reports.sort(key=lambda x: x['completion_rate'], reverse=True)

    overall_rate = (
        round(total_completed / total_assigned * 100, 1)
        if total_assigned > 0 else 0.0
    )

    return Response({
        'date':                    report_date.isoformat(),
        'total_employees':         employees.count(),
        'employees_logged':        sum(1 for r in employee_reports if r['log_submitted']),
        'total_tasks_assigned':    total_assigned,
        'total_tasks_completed':   total_completed,
        'total_hours_worked':      round(total_hours, 1),
        'overall_completion_rate': overall_rate,
        'employee_reports':        employee_reports,
    })


@api_view(['GET'])
@permission_classes([IsManagerOrAbove])
def weekly_report_view(request):
    """
    GET /api/reports/weekly/?week_start=2026-03-02
    Aggregates daily logs for a 7-day window.
    """
    week_start_str = request.query_params.get('week_start')
    if week_start_str:
        try:
            week_start = datetime.date.fromisoformat(week_start_str)
        except ValueError:
            return Response({'detail': 'Invalid date. Use YYYY-MM-DD.'}, status=400)
    else:
        today      = datetime.date.today()
        week_start = today - datetime.timedelta(days=today.weekday())  # Monday

    week_end = week_start + datetime.timedelta(days=6)

    employees = (
        Employee.objects
        .filter(status='active')
        .select_related('department')
        .order_by('full_name')
    )

    logs_qs = (
        DailyWorkLog.objects
        .filter(date__gte=week_start, date__lte=week_end)
        .select_related('employee')
        .prefetch_related('tasks_assigned', 'tasks_completed')
    )

    # Group logs by employee
    from collections import defaultdict
    emp_logs = defaultdict(list)
    for log in logs_qs:
        emp_logs[log.employee_id].append(log)

    result = []
    for emp in employees:
        logs = emp_logs[emp.id]
        total_assigned  = sum(l.tasks_assigned_count  for l in logs)
        total_completed = sum(l.tasks_completed_count for l in logs)
        total_hours     = sum(float(l.hours_worked)   for l in logs)
        days_logged     = len(logs)
        completion_rate = (
            round(total_completed / total_assigned * 100, 1)
            if total_assigned > 0 else 0.0
        )
        avg_hours = round(total_hours / days_logged, 1) if days_logged > 0 else 0.0
        # Productivity: 70% completion, 30% hours (normalised to 40-hr week)
        productivity = min(100.0, round(
            completion_rate * 0.7 + min(total_hours, 40) / 40 * 30, 1
        ))

        result.append({
            'employee_id':           emp.id,
            'employee_code':         emp.employee_id,
            'employee_name':         emp.full_name,
            'department':            emp.department.name if emp.department else None,
            'total_tasks_assigned':  total_assigned,
            'total_tasks_completed': total_completed,
            'completion_rate':       completion_rate,
            'total_hours_worked':    round(total_hours, 1),
            'avg_daily_hours':       avg_hours,
            'days_logged':           days_logged,
            'productivity_score':    productivity,
        })

    result.sort(key=lambda x: x['productivity_score'], reverse=True)

    return Response({
        'week_start':       week_start.isoformat(),
        'week_end':         week_end.isoformat(),
        'employee_reports': result,
    })


@api_view(['GET'])
@permission_classes([IsManagerOrAbove])
def monthly_report_view(request):
    """
    GET /api/reports/monthly/?month=3&year=2026
    """
    today = datetime.date.today()
    try:
        month = int(request.query_params.get('month', today.month))
        year  = int(request.query_params.get('year',  today.year))
    except ValueError:
        return Response({'detail': 'Invalid month or year.'}, status=400)

    _, days_in_month = calendar.monthrange(year, month)
    month_start = datetime.date(year, month, 1)
    month_end   = datetime.date(year, month, days_in_month)

    # Working days (Mon–Fri)
    working_days = sum(
        1 for d in range(days_in_month)
        if (month_start + datetime.timedelta(days=d)).weekday() < 5
    )

    employees = (
        Employee.objects
        .filter(status='active')
        .select_related('department')
        .order_by('full_name')
    )

    logs_qs = (
        DailyWorkLog.objects
        .filter(date__gte=month_start, date__lte=month_end)
        .select_related('employee')
        .prefetch_related('tasks_assigned', 'tasks_completed')
    )

    from collections import defaultdict
    emp_logs = defaultdict(list)
    for log in logs_qs:
        emp_logs[log.employee_id].append(log)

    result = []
    for emp in employees:
        logs            = emp_logs[emp.id]
        total_assigned  = sum(l.tasks_assigned_count  for l in logs)
        total_completed = sum(l.tasks_completed_count for l in logs)
        total_hours     = sum(float(l.hours_worked)   for l in logs)
        days_logged     = len(logs)
        completion_rate = (
            round(total_completed / total_assigned * 100, 1)
            if total_assigned > 0 else 0.0
        )
        attendance_rate = (
            round(days_logged / working_days * 100, 1)
            if working_days > 0 else 0.0
        )
        avg_daily_hours = round(total_hours / days_logged, 1) if days_logged > 0 else 0.0
        # Productivity: 60% completion + 20% attendance + 20% hours
        productivity = min(100.0, round(
            completion_rate * 0.6
            + attendance_rate * 0.2
            + min(avg_daily_hours, 8) / 8 * 20, 1
        ))

        result.append({
            'employee_id':           emp.id,
            'employee_code':         emp.employee_id,
            'employee_name':         emp.full_name,
            'department':            emp.department.name if emp.department else None,
            'total_tasks_assigned':  total_assigned,
            'total_tasks_completed': total_completed,
            'completion_rate':       completion_rate,
            'total_hours_worked':    round(total_hours, 1),
            'avg_daily_hours':       avg_daily_hours,
            'days_logged':           days_logged,
            'working_days':          working_days,
            'attendance_rate':       attendance_rate,
            'productivity_score':    productivity,
        })

    result.sort(key=lambda x: x['productivity_score'], reverse=True)

    return Response({
        'month':            month,
        'year':             year,
        'month_name':       calendar.month_name[month],
        'working_days':     working_days,
        'employee_reports': result,
    })


@api_view(['GET'])
@permission_classes([IsManagerOrAbove])
def completion_trend_view(request):
    """
    GET /api/reports/trend/?days=7
    Returns daily task completion stats for the last N days (for line chart).
    """
    try:
        days = max(1, min(90, int(request.query_params.get('days', 7))))
    except ValueError:
        days = 7

    today = datetime.date.today()
    data  = []

    for i in range(days - 1, -1, -1):
        d    = today - datetime.timedelta(days=i)
        logs = DailyWorkLog.objects.filter(date=d).prefetch_related(
            'tasks_completed', 'tasks_assigned'
        )

        # Cross-check with actual Task.completed_at for accuracy
        tasks_done_today = Task.objects.filter(
            completed_at__date=d, status='completed'
        ).count()

        log_completed = sum(l.tasks_completed_count for l in logs)
        log_assigned  = sum(l.tasks_assigned_count  for l in logs)
        log_hours     = sum(float(l.hours_worked)   for l in logs)

        data.append({
            'date':             d.isoformat(),
            'day_label':        d.strftime('%a %d'),
            'tasks_completed':  max(tasks_done_today, log_completed),
            'tasks_assigned':   log_assigned,
            'hours_worked':     round(log_hours, 1),
            'logs_submitted':   logs.count(),
        })

    return Response(data)
