"""
Tracking module views.

Endpoints:
    GET/POST  /api/tracking/reports/                — list own / create daily report
    GET/PATCH  /api/tracking/reports/<pk>/          — retrieve / update report
    POST       /api/tracking/reports/<pk>/review/   — HR/Manager review (approve/reject)
    GET        /api/tracking/reports/summary/       — admin: aggregated stats

    GET/POST   /api/tracking/timers/                — list own / start timer
    POST       /api/tracking/timers/<pk>/stop/      — stop active timer
    GET        /api/tracking/timers/summary/        — total time per task

    GET        /api/tracking/productivity/          — admin: per-employee productivity stats
    GET        /api/tracking/online-users/          — real-time presence snapshot
"""

import datetime
from django.utils import timezone
from django.db.models import Sum, Count, Avg, Q
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import DailyWorkReport, TaskTimeLog
from .serializers import DailyWorkReportSerializer, TaskTimeLogSerializer
from apps.authentication.permissions import IsManagerOrAbove
from apps.activity.utils import log_activity


# ─── Daily Work Report ────────────────────────────────────────────────────────

class DailyReportListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/tracking/reports/   — own reports (employees); all (managers+)
    POST /api/tracking/reports/   — create / upsert today's draft
    """
    serializer_class = DailyWorkReportSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = DailyWorkReport.objects.select_related(
            'employee__department', 'reviewed_by'
        )
        if not user.is_manager_or_above:
            try:
                qs = qs.filter(employee=user.employee_profile)
            except Exception:
                return DailyWorkReport.objects.none()
        else:
            # Filters for managers
            emp_id = self.request.query_params.get('employee')
            dept   = self.request.query_params.get('department')
            status_f = self.request.query_params.get('status')
            date_from = self.request.query_params.get('date_from')
            date_to   = self.request.query_params.get('date_to')

            if emp_id:
                qs = qs.filter(employee_id=emp_id)
            if dept:
                qs = qs.filter(employee__department_id=dept)
            if status_f:
                qs = qs.filter(status=status_f)
            if date_from:
                qs = qs.filter(report_date__gte=date_from)
            if date_to:
                qs = qs.filter(report_date__lte=date_to)

        return qs.order_by('-report_date')

    def perform_create(self, serializer):
        user = self.request.user
        try:
            employee = user.employee_profile
        except Exception:
            from rest_framework.exceptions import ValidationError
            raise ValidationError('No employee profile linked to your account.')

        # Prevent duplicate: if one already exists for this date, update it instead
        report_date = serializer.validated_data.get('report_date', datetime.date.today())
        existing = DailyWorkReport.objects.filter(
            employee=employee, report_date=report_date
        ).first()
        if existing:
            for attr, value in serializer.validated_data.items():
                setattr(existing, attr, value)
            existing.save()
            serializer.instance = existing
            return

        report = serializer.save(employee=employee)
        if report.status == DailyWorkReport.Status.SUBMITTED:
            log_activity(
                actor=user,
                verb='daily_report_submitted',
                description=f'{employee.full_name} submitted daily report for {report.report_date}',
                target_type='daily_report',
                target_id=report.id,
                target_name=str(report.report_date),
            )


class DailyReportDetailView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/tracking/reports/<pk>/"""
    serializer_class = DailyWorkReportSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = DailyWorkReport.objects.select_related('employee__department', 'reviewed_by')
        if not user.is_manager_or_above:
            try:
                return qs.filter(employee=user.employee_profile)
            except Exception:
                return DailyWorkReport.objects.none()
        return qs

    def perform_update(self, serializer):
        user = self.request.user
        old_status = self.get_object().status
        report = serializer.save()
        if old_status != DailyWorkReport.Status.SUBMITTED and report.status == DailyWorkReport.Status.SUBMITTED:
            log_activity(
                actor=user,
                verb='daily_report_submitted',
                description=f'{report.employee.full_name} submitted daily report for {report.report_date}',
                target_type='daily_report',
                target_id=report.id,
                target_name=str(report.report_date),
            )


@api_view(['POST'])
@permission_classes([IsManagerOrAbove])
def review_daily_report(request, pk):
    """POST /api/tracking/reports/<pk>/review/  — approve or reject."""
    try:
        report = DailyWorkReport.objects.select_related('employee').get(pk=pk)
    except DailyWorkReport.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    action = request.data.get('action')  # 'approve' or 'reject'
    comment = request.data.get('comment', '')

    if action not in ('approve', 'reject'):
        return Response({'detail': "action must be 'approve' or 'reject'."}, status=400)

    report.status       = DailyWorkReport.Status.REVIEWED if action == 'approve' else DailyWorkReport.Status.REJECTED
    report.reviewed_by  = request.user
    report.review_comment = comment
    report.reviewed_at  = timezone.now()
    report.save(update_fields=['status', 'reviewed_by', 'review_comment', 'reviewed_at'])

    # Notify the employee
    try:
        from apps.notifications.utils import send_notification
        action_text = 'approved' if action == 'approve' else 'rejected'
        send_notification(
            recipient=report.employee.user,
            title=f'Daily Report {action_text.capitalize()}',
            message=f'Your daily report for {report.report_date} was {action_text} by {request.user.full_name}.',
            notification_type='general',
        )
    except Exception:
        pass

    log_activity(
        actor=request.user,
        verb='task_updated',
        description=f'{request.user.full_name} {action}d daily report for {report.employee.full_name} ({report.report_date})',
        target_type='daily_report',
        target_id=report.id,
    )

    return Response(DailyWorkReportSerializer(report, context={'request': request}).data)


@api_view(['GET'])
@permission_classes([IsManagerOrAbove])
def report_summary(request):
    """
    GET /api/tracking/reports/summary/
    Aggregated stats: total submitted today, pending review, by dept, etc.
    """
    today = datetime.date.today()
    date_from = request.query_params.get('date_from', str(today))
    date_to   = request.query_params.get('date_to',   str(today))

    qs = DailyWorkReport.objects.filter(
        report_date__gte=date_from, report_date__lte=date_to
    )

    submitted_today = qs.filter(
        report_date=today, status=DailyWorkReport.Status.SUBMITTED
    ).count()
    pending_review  = qs.filter(status=DailyWorkReport.Status.SUBMITTED).count()
    total_reports   = qs.count()

    by_status = list(
        qs.values('status').annotate(count=Count('id'))
    )

    by_dept = list(
        qs.values('employee__department__name')
          .annotate(
              count=Count('id'),
              avg_completion=Avg('tasks_completed'),
              avg_hours=Avg('hours_worked'),
          )
          .order_by('-count')
    )

    # Recent 7-day trend: submitted count per day
    seven_days_ago = today - datetime.timedelta(days=6)
    trend_qs = (
        DailyWorkReport.objects
        .filter(report_date__gte=seven_days_ago, status__in=['submitted', 'reviewed'])
        .values('report_date')
        .annotate(count=Count('id'))
        .order_by('report_date')
    )

    return Response({
        'submitted_today': submitted_today,
        'pending_review':  pending_review,
        'total_reports':   total_reports,
        'by_status':       by_status,
        'by_department':   by_dept,
        'trend':           list(trend_qs),
        'date_range':      {'from': date_from, 'to': date_to},
    })


# ─── Task Time Tracking ───────────────────────────────────────────────────────

class TaskTimerListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/tracking/timers/  — list own timers (managers see all)
    POST /api/tracking/timers/  — start a new timer
    """
    serializer_class = TaskTimeLogSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = TaskTimeLog.objects.select_related('employee', 'task')
        if not user.is_manager_or_above:
            try:
                qs = qs.filter(employee=user.employee_profile)
            except Exception:
                return TaskTimeLog.objects.none()
        else:
            emp_id  = self.request.query_params.get('employee')
            task_id = self.request.query_params.get('task')
            active  = self.request.query_params.get('active')
            if emp_id:
                qs = qs.filter(employee_id=emp_id)
            if task_id:
                qs = qs.filter(task_id=task_id)
            if active == 'true':
                qs = qs.filter(is_active=True)

        date = self.request.query_params.get('date')
        if date:
            qs = qs.filter(start_time__date=date)

        return qs.order_by('-start_time')

    def perform_create(self, serializer):
        user = self.request.user
        try:
            employee = user.employee_profile
        except Exception:
            from rest_framework.exceptions import ValidationError
            raise ValidationError('No employee profile linked to your account.')

        # Stop any existing active timer for this employee first
        TaskTimeLog.objects.filter(employee=employee, is_active=True).update(
            is_active=False,
            end_time=timezone.now(),
        )
        # Recompute duration for stopped ones
        for tlog in TaskTimeLog.objects.filter(employee=employee, is_active=False, duration_minutes=0, end_time__isnull=False):
            delta = tlog.end_time - tlog.start_time
            tlog.duration_minutes = max(int(delta.total_seconds() / 60), 0)
            tlog.save(update_fields=['duration_minutes'])

        timer = serializer.save(employee=employee, is_active=True)
        log_activity(
            actor=user,
            verb='timer_started',
            description=f'{employee.full_name} started timer on "{timer.task.name}"',
            target_type='task',
            target_id=timer.task_id,
            target_name=timer.task.name,
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def stop_timer(request, pk):
    """POST /api/tracking/timers/<pk>/stop/"""
    user = request.user
    try:
        employee = user.employee_profile
    except Exception:
        return Response({'detail': 'No employee profile.'}, status=400)

    try:
        timer = TaskTimeLog.objects.get(pk=pk, employee=employee, is_active=True)
    except TaskTimeLog.DoesNotExist:
        return Response({'detail': 'Active timer not found.'}, status=404)

    notes = request.data.get('notes', '')
    if notes:
        timer.notes = notes
    timer.stop()

    log_activity(
        actor=user,
        verb='timer_stopped',
        description=f'{employee.full_name} stopped timer on "{timer.task.name}" ({timer.duration_minutes} min)',
        target_type='task',
        target_id=timer.task_id,
        target_name=timer.task.name,
    )

    return Response(TaskTimeLogSerializer(timer, context={'request': request}).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def timer_summary(request):
    """
    GET /api/tracking/timers/summary/
    Returns total minutes per task for the requesting employee (or ?employee=id for managers).
    """
    user = request.user
    if user.is_manager_or_above:
        emp_id = request.query_params.get('employee')
        if emp_id:
            qs = TaskTimeLog.objects.filter(employee_id=emp_id, is_active=False)
        else:
            qs = TaskTimeLog.objects.filter(is_active=False)
    else:
        try:
            employee = user.employee_profile
        except Exception:
            return Response({'results': []})
        qs = TaskTimeLog.objects.filter(employee=employee, is_active=False)

    date_from = request.query_params.get('date_from')
    date_to   = request.query_params.get('date_to')
    if date_from:
        qs = qs.filter(start_time__date__gte=date_from)
    if date_to:
        qs = qs.filter(start_time__date__lte=date_to)

    summary = list(
        qs.values('task__id', 'task__name', 'task__task_id')
          .annotate(total_minutes=Sum('duration_minutes'), sessions=Count('id'))
          .order_by('-total_minutes')
    )
    # active timer for the user
    active_timer = None
    if not user.is_manager_or_above:
        active = TaskTimeLog.objects.filter(employee=employee, is_active=True).select_related('task').first()
        if active:
            active_timer = TaskTimeLogSerializer(active, context={'request': request}).data

    return Response({'summary': summary, 'active_timer': active_timer})


# ─── Productivity Dashboard ───────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsManagerOrAbove])
def productivity_dashboard(request):
    """
    GET /api/tracking/productivity/
    Per-employee productivity stats: reports submitted, avg completion rate,
    total hours, avg hours, total time logged (timers).
    Supports ?department=id, ?date_from=, ?date_to=
    """
    today = datetime.date.today()
    date_from = request.query_params.get('date_from', str(today - datetime.timedelta(days=6)))
    date_to   = request.query_params.get('date_to', str(today))
    dept      = request.query_params.get('department')

    report_qs = DailyWorkReport.objects.filter(
        report_date__gte=date_from,
        report_date__lte=date_to,
    )
    timer_qs = TaskTimeLog.objects.filter(
        start_time__date__gte=date_from,
        start_time__date__lte=date_to,
        is_active=False,
    )

    if dept:
        report_qs = report_qs.filter(employee__department_id=dept)
        timer_qs  = timer_qs.filter(employee__department_id=dept)

    # Aggregate per employee from reports
    from apps.employees.models import Employee
    employee_qs = Employee.objects.select_related('user', 'department')
    if dept:
        employee_qs = employee_qs.filter(department_id=dept)

    # Build a map for reports and timers
    report_stats = {
        r['employee']: r
        for r in report_qs.values('employee')
            .annotate(
                reports_submitted=Count('id', filter=Q(status__in=['submitted', 'reviewed'])),
                total_hours=Sum('hours_worked'),
                avg_tasks_completed=Avg('tasks_completed'),
                avg_tasks_assigned=Avg('tasks_assigned'),
            )
    }
    timer_stats = {
        t['employee']: t
        for t in timer_qs.values('employee')
            .annotate(total_timer_minutes=Sum('duration_minutes'))
    }

    rows = []
    for emp in employee_qs:
        rs = report_stats.get(emp.id, {})
        ts = timer_stats.get(emp.id, {})
        avg_assigned  = float(rs.get('avg_tasks_assigned') or 0)
        avg_completed = float(rs.get('avg_tasks_completed') or 0)
        completion_rate = round(avg_completed / avg_assigned * 100, 1) if avg_assigned > 0 else 0.0
        rows.append({
            'employee_id':        emp.id,
            'employee_code':      emp.employee_id,
            'employee_name':      emp.full_name,
            'department':         emp.department.name if emp.department else '',
            'reports_submitted':  rs.get('reports_submitted', 0),
            'total_hours':        float(rs.get('total_hours') or 0),
            'avg_tasks_completed': round(avg_completed, 1),
            'avg_tasks_assigned':  round(avg_assigned, 1),
            'completion_rate':    completion_rate,
            'total_timer_minutes': ts.get('total_timer_minutes', 0) or 0,
        })

    # Sort by completion_rate desc
    rows.sort(key=lambda x: x['completion_rate'], reverse=True)

    # Trend: daily total hours over the period
    from apps.attendance.models import AttendanceLog
    attendance_trend = list(
        AttendanceLog.objects
        .filter(date__gte=date_from, date__lte=date_to)
        .values('date')
        .annotate(total_hours=Sum('total_work_hours'), present_count=Count('id'))
        .order_by('date')
    )

    return Response({
        'employees':        rows,
        'attendance_trend': attendance_trend,
        'date_range':       {'from': date_from, 'to': date_to},
        'total_employees':  len(rows),
    })


@api_view(['GET'])
@permission_classes([IsManagerOrAbove])
def online_users(request):
    """
    GET /api/tracking/online-users/
    Real-time presence snapshot from UserPresence model.
    """
    from apps.attendance.models import UserPresence, AttendanceLog
    from apps.employees.models import Employee

    today = datetime.date.today()
    presences = UserPresence.objects.select_related(
        'user__employee_profile__department'
    ).exclude(status='offline')

    rows = []
    for p in presences:
        user = p.user
        emp  = getattr(user, 'employee_profile', None)
        # Today's attendance
        attendance = None
        if emp:
            attendance = AttendanceLog.objects.filter(employee=emp, date=today).first()
        rows.append({
            'user_id':       user.id,
            'employee_id':   emp.id if emp else None,
            'employee_code': emp.employee_id if emp else '',
            'full_name':     user.full_name,
            'role':          user.role,
            'department':    emp.department.name if emp and emp.department else '',
            'status':        p.status,
            'last_active':   p.last_active.isoformat(),
            'last_active_display': p.last_active_display,
            'login_time':    attendance.login_time.isoformat() if attendance and attendance.login_time else None,
            'work_hours':    float(attendance.total_work_hours) if attendance else 0,
        })

    return Response({
        'online_count':  sum(1 for r in rows if r['status'] == 'online'),
        'away_count':    sum(1 for r in rows if r['status'] == 'away'),
        'users':         rows,
    })
