"""
Attendance & Presence API views.

Endpoints:
    POST /api/attendance/checkin/                — record today's login
    POST /api/attendance/checkout/               — record today's logout
    GET  /api/attendance/today/                  — my attendance today
    GET  /api/attendance/my/                     — my attendance history
    GET  /api/attendance/                        — admin: all records (filtered)
    GET  /api/attendance/presence/               — admin: real-time presence dashboard
    GET  /api/attendance/reports/daily/          — daily attendance report
    GET  /api/attendance/reports/weekly/         — weekly attendance report
    GET  /api/attendance/reports/monthly/        — monthly attendance report
"""

import calendar
import datetime

from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import AttendanceLog, UserPresence
from .serializers import AttendanceLogSerializer
from apps.authentication.permissions import IsManagerOrAbove


# ── helpers ───────────────────────────────────────────────────────────────────

def _fmt_time(dt):
    return timezone.localtime(dt).strftime('%I:%M %p') if dt else None


def _last_seen_display(last_seen):
    """Human-readable 'X ago' string from a datetime (mirrors UserPresence.last_active_display)."""
    if not last_seen:
        return 'Never'
    diff_s = int((timezone.now() - last_seen).total_seconds())
    if diff_s < 60:
        return 'just now'
    if diff_s < 3600:
        return f'{diff_s // 60} min ago'
    if diff_s < 86400:
        return f'{diff_s // 3600} hr ago'
    return f'{diff_s // 86400} days ago'


def _get_client_ip(request):
    x_forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if x_forwarded:
        return x_forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', None)


# ── Check-in / Check-out ─────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def checkin_view(request):
    """Record today's login for the current user (idempotent)."""
    try:
        employee = request.user.employee_profile
    except Exception:
        # Founders/admins without employee profiles — silently succeed
        return Response({'detail': 'No employee profile; attendance not tracked.'}, status=200)

    today = datetime.date.today()
    ip    = _get_client_ip(request)

    log, created = AttendanceLog.objects.get_or_create(
        employee=employee,
        date=today,
        defaults={'login_time': timezone.now(), 'ip_address': ip},
    )

    if created:
        log.auto_set_status()
        log.save(update_fields=['status'])
    elif not log.login_time:
        # Record existed (e.g. manually created) but no login yet
        log.login_time = timezone.now()
        log.ip_address = ip
        log.auto_set_status()
        log.save(update_fields=['login_time', 'ip_address', 'status'])

    return Response(AttendanceLogSerializer(log).data, status=200)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def checkout_view(request):
    """Record today's logout for the current user (idempotent)."""
    try:
        employee = request.user.employee_profile
    except Exception:
        return Response({'detail': 'No employee profile.'}, status=200)

    today = datetime.date.today()

    try:
        log = AttendanceLog.objects.get(employee=employee, date=today)
    except AttendanceLog.DoesNotExist:
        return Response({'detail': 'No check-in found for today.'}, status=404)

    if not log.logout_time:
        log.logout_time = timezone.now()
        log.save()  # triggers calculate_work_hours via model.save()

    return Response(AttendanceLogSerializer(log).data, status=200)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def today_view(request):
    """Get today's attendance log for the current user."""
    try:
        employee = request.user.employee_profile
    except Exception:
        return Response(None, status=200)

    today = datetime.date.today()
    try:
        log = AttendanceLog.objects.get(employee=employee, date=today)
        return Response(AttendanceLogSerializer(log).data)
    except AttendanceLog.DoesNotExist:
        return Response(None, status=200)


# ── Employee self-service ─────────────────────────────────────────────────────

class MyAttendanceView(generics.ListAPIView):
    """GET /api/attendance/my/ — paginated personal attendance history."""
    serializer_class   = AttendanceLogSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        try:
            employee = self.request.user.employee_profile
        except Exception:
            return AttendanceLog.objects.none()

        qs = AttendanceLog.objects.filter(employee=employee).order_by('-date')

        start = self.request.query_params.get('start_date')
        end   = self.request.query_params.get('end_date')
        if start:
            qs = qs.filter(date__gte=start)
        if end:
            qs = qs.filter(date__lte=end)
        return qs


# ── Admin views ───────────────────────────────────────────────────────────────

class AdminAttendanceView(generics.ListAPIView):
    """GET /api/attendance/ — manager sees all records."""
    serializer_class   = AttendanceLogSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAbove]

    def get_queryset(self):
        qs = AttendanceLog.objects.select_related(
            'employee', 'employee__user', 'employee__department'
        ).order_by('-date', '-login_time')

        date_p   = self.request.query_params.get('date')
        emp_p    = self.request.query_params.get('employee')
        status_p = self.request.query_params.get('status')

        if date_p:
            qs = qs.filter(date=date_p)
        if emp_p:
            qs = qs.filter(employee_id=emp_p)
        if status_p:
            qs = qs.filter(status=status_p)
        return qs


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAbove])
def presence_dashboard_view(request):
    """
    GET /api/attendance/presence/
    Returns real-time presence + today's attendance for every employee.
    """
    from apps.employees.models import Employee

    employees  = Employee.objects.select_related('user', 'department').all()
    today      = datetime.date.today()
    today_logs = {
        log.employee_id: log
        for log in AttendanceLog.objects.filter(date=today)
    }

    records = []
    for emp in employees:
        user = emp.user

        # User.is_online is kept fresh by OnlineTrackingJWTAuthentication on every
        # HTTP request, so it's the primary truth (works even without Redis/WebSockets).
        if user.is_online:
            st = 'online'
        else:
            # Fall back to UserPresence for away/offline distinction
            try:
                st = user.presence.status   # may be 'away' or 'offline'
            except Exception:
                st = 'offline'

        # last_active — prefer UserPresence, fall back to User.last_seen
        try:
            p    = user.presence
            la   = p.last_active.isoformat()
            la_d = p.last_active_display
        except Exception:
            if user.last_seen:
                la   = user.last_seen.isoformat()
                la_d = _last_seen_display(user.last_seen)
            else:
                la, la_d = None, 'Never'

        log = today_logs.get(emp.id)
        records.append({
            'user_id':             user.id,
            'employee_id':         emp.id,
            'employee_code':       emp.employee_id,
            'full_name':           emp.full_name,
            'department':          emp.department.name if emp.department else None,
            'role':                user.role,
            'profile_photo':       emp.profile_photo.url if emp.profile_photo else None,
            'status':              st,
            'last_active':         la,
            'last_active_display': la_d,
            'login_time_str':      _fmt_time(log.login_time)  if log else None,
            'logout_time_str':     _fmt_time(log.logout_time) if log else None,
            'total_work_hours':    float(log.total_work_hours) if log else 0,
            'attendance_status':   log.status if log else 'absent',
            'checked_in':          bool(log and log.login_time),
        })

    summary = {
        'total':   len(records),
        'online':  sum(1 for r in records if r['status'] == 'online'),
        'away':    sum(1 for r in records if r['status'] == 'away'),
        'offline': sum(1 for r in records if r['status'] == 'offline'),
        'present': sum(1 for r in records if r['checked_in']),
    }
    return Response({'employees': records, 'summary': summary})


# ── Attendance Reports ────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAbove])
def attendance_daily_report(request):
    """GET /api/attendance/reports/daily/?date=YYYY-MM-DD"""
    from apps.employees.models import Employee

    date_str = request.query_params.get('date', str(datetime.date.today()))
    try:
        report_date = datetime.date.fromisoformat(date_str)
    except ValueError:
        return Response({'detail': 'Invalid date format.'}, status=400)

    logs = {
        log.employee_id: log
        for log in AttendanceLog.objects.filter(date=report_date).select_related('employee')
    }
    employees = Employee.objects.select_related('department').all()

    records = []
    for emp in employees:
        log = logs.get(emp.id)
        records.append({
            'employee_id':     emp.id,
            'employee_code':   emp.employee_id,
            'employee_name':   emp.full_name,
            'department':      emp.department.name if emp.department else None,
            'status':          log.status if log else 'absent',
            'login_time_str':  _fmt_time(log.login_time)  if log else None,
            'logout_time_str': _fmt_time(log.logout_time) if log else None,
            'total_work_hours': float(log.total_work_hours) if log else 0,
            'ip_address':      log.ip_address if log else None,
            'checked_in':      bool(log and log.login_time),
        })

    total_hours = sum(r['total_work_hours'] for r in records)
    present     = sum(1 for r in records if r['status'] in ('present', 'late', 'half_day'))
    late        = sum(1 for r in records if r['status'] == 'late')
    absent      = sum(1 for r in records if r['status'] == 'absent')

    return Response({
        'date':    date_str,
        'records': records,
        'summary': {
            'total':       len(records),
            'present':     present,
            'late':        late,
            'absent':      absent,
            'total_hours': round(total_hours, 2),
        },
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAbove])
def attendance_weekly_report(request):
    """GET /api/attendance/reports/weekly/?week_start=YYYY-MM-DD"""
    from apps.employees.models import Employee

    week_start_str = request.query_params.get('week_start')
    if week_start_str:
        try:
            week_start = datetime.date.fromisoformat(week_start_str)
        except ValueError:
            return Response({'detail': 'Invalid week_start.'}, status=400)
    else:
        today      = datetime.date.today()
        week_start = today - datetime.timedelta(days=today.weekday())

    week_end = week_start + datetime.timedelta(days=6)

    logs = AttendanceLog.objects.filter(
        date__gte=week_start, date__lte=week_end
    ).select_related('employee', 'employee__department')

    emp_logs: dict = {}
    for log in logs:
        emp_logs.setdefault(log.employee_id, []).append(log)

    employees = Employee.objects.select_related('department').all()
    records   = []

    for emp in employees:
        emp_day_logs = emp_logs.get(emp.id, [])
        days_present = len([l for l in emp_day_logs if l.status in ('present', 'late', 'half_day')])
        days_late    = len([l for l in emp_day_logs if l.status == 'late'])
        total_hours  = sum(float(l.total_work_hours) for l in emp_day_logs)
        avg_hours    = round(total_hours / days_present, 2) if days_present > 0 else 0

        # Build Mon-Sun breakdown
        day_breakdown = {}
        for offset in range(7):
            day = week_start + datetime.timedelta(days=offset)
            day_log = next((l for l in emp_day_logs if l.date == day), None)
            day_breakdown[day.strftime('%a')] = {
                'date':           str(day),
                'status':         day_log.status if day_log else 'absent',
                'hours':          float(day_log.total_work_hours) if day_log else 0,
                'login_time_str': _fmt_time(day_log.login_time) if day_log else None,
            }

        records.append({
            'employee_id':   emp.id,
            'employee_code': emp.employee_id,
            'employee_name': emp.full_name,
            'department':    emp.department.name if emp.department else None,
            'days_present':  days_present,
            'days_late':     days_late,
            'days_absent':   7 - days_present,
            'total_hours':   round(total_hours, 2),
            'avg_hours':     avg_hours,
            'days':          day_breakdown,
        })

    return Response({
        'week_start': str(week_start),
        'week_end':   str(week_end),
        'records':    records,
        'summary': {
            'total_employees': len(records),
            'avg_attendance':  round(
                sum(r['days_present'] for r in records) / len(records), 1
            ) if records else 0,
            'total_hours':     round(sum(r['total_hours'] for r in records), 2),
        },
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAbove])
def attendance_monthly_report(request):
    """GET /api/attendance/reports/monthly/?month=3&year=2026"""
    from apps.employees.models import Employee

    today = datetime.date.today()
    try:
        month = int(request.query_params.get('month', today.month))
        year  = int(request.query_params.get('year',  today.year))
    except (ValueError, TypeError):
        return Response({'detail': 'Invalid month/year.'}, status=400)

    month_start = datetime.date(year, month, 1)
    month_end   = datetime.date(year, month, calendar.monthrange(year, month)[1])
    working_days = sum(
        1 for i in range((month_end - month_start).days + 1)
        if (month_start + datetime.timedelta(days=i)).weekday() < 5
    )

    logs = AttendanceLog.objects.filter(
        date__gte=month_start, date__lte=month_end
    ).select_related('employee')

    emp_logs: dict = {}
    for log in logs:
        emp_logs.setdefault(log.employee_id, []).append(log)

    employees = Employee.objects.select_related('department').all()
    records   = []

    for emp in employees:
        emp_day_logs  = emp_logs.get(emp.id, [])
        days_present  = len([l for l in emp_day_logs if l.status in ('present', 'late', 'half_day')])
        days_late     = len([l for l in emp_day_logs if l.status == 'late'])
        total_hours   = sum(float(l.total_work_hours) for l in emp_day_logs)
        att_pct       = round(days_present / working_days * 100, 1) if working_days else 0
        avg_hours     = round(total_hours / days_present, 2) if days_present > 0 else 0
        late_logins   = [_fmt_time(l.login_time) for l in emp_day_logs if l.status == 'late']

        records.append({
            'employee_id':     emp.id,
            'employee_code':   emp.employee_id,
            'employee_name':   emp.full_name,
            'department':      emp.department.name if emp.department else None,
            'days_present':    days_present,
            'days_late':       days_late,
            'days_absent':     working_days - days_present,
            'total_hours':     round(total_hours, 2),
            'avg_hours':       avg_hours,
            'attendance_pct':  att_pct,
            'late_logins':     late_logins,
        })

    records.sort(key=lambda r: r['attendance_pct'], reverse=True)

    return Response({
        'month':        month,
        'year':         year,
        'month_name':   calendar.month_name[month],
        'working_days': working_days,
        'records':      records,
        'summary': {
            'total_employees': len(records),
            'avg_attendance':  round(
                sum(r['attendance_pct'] for r in records) / len(records), 1
            ) if records else 0,
            'total_hours':     round(sum(r['total_hours'] for r in records), 2),
            'avg_daily_hours': round(
                sum(r['avg_hours'] for r in records) / len(records), 2
            ) if records else 0,
        },
    })
