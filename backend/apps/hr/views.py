"""
HR module views — all endpoints under /api/hr/
"""

import calendar
import csv
import io
from datetime import date, timedelta
from decimal import Decimal

from django.db import models as db_models
from django.db.models import Count, Q, Avg, Sum
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.authentication.permissions import IsHROrAbove, IsManagerOrAbove
from apps.attendance.models import AttendanceLog
from apps.attendance.serializers import AttendanceLogSerializer
from apps.employees.models import Employee
from apps.departments.models import Department
from apps.notifications.utils import create_notification
from apps.activity.utils import log_activity
from apps.worklogs.models import DailyWorkLog
from apps.tasks.models import Task
from apps.tasks.serializers import TaskListSerializer, TaskCreateSerializer, TaskDetailSerializer

from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404

from .constants import DEFAULT_LEAVE_ALLOWANCE
from .models import (
    LeaveRequest, LeaveBalance, HRDocument, RecruitmentPosition, Applicant,
    EmployeeBankDetails, BankDetailsChangeLog, SalaryStructure, SalaryPayment, Payslip,
    JobPosition, Candidate, Interview, CandidateEvaluation, CandidateDocument,
)
from .serializers import (
    LeaveRequestSerializer,
    LeaveBalanceSerializer,
    HRDocumentSerializer,
    RecruitmentPositionSerializer,
    ApplicantSerializer,
    EmployeeBankDetailsSerializer,
    BankDetailsChangeLogSerializer,
    SalaryStructureSerializer,
    SalaryPaymentSerializer,
    PayslipSerializer,
    JobPositionSerializer,
    CandidateListSerializer,
    CandidateDetailSerializer,
    InterviewSerializer,
    CandidateEvaluationSerializer,
    CandidateDocumentSerializer,
)

# ── Helper ────────────────────────────────────────────────────────────────────

def get_client_ip(request):
    x_forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded:
        return x_forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def _ensure_leave_balance(employee, leave_type, year):
    """Get or create a LeaveBalance with default allowance."""
    balance, created = LeaveBalance.objects.get_or_create(
        employee=employee,
        leave_type=leave_type,
        year=year,
        defaults={'total_days': DEFAULT_LEAVE_ALLOWANCE.get(leave_type, 0)},
    )
    return balance


# ── Dashboard ─────────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsHROrAbove])
def hr_dashboard(request):
    today = timezone.localtime(timezone.now()).date()
    this_month = today.replace(day=1)

    # Basic employee counts
    total_employees    = Employee.objects.count()
    active_employees   = Employee.objects.filter(status='active').count()
    inactive_employees = Employee.objects.filter(status='inactive').count()

    # On leave today — employees with approved leave spanning today
    on_leave_today = LeaveRequest.objects.filter(
        status='approved',
        start_date__lte=today,
        end_date__gte=today,
    ).values('employee').distinct().count()

    pending_leave_requests = LeaveRequest.objects.filter(status='pending').count()

    # Monthly attendance rate (current month)
    _, days_in_month = calendar.monthrange(today.year, today.month)
    working_days_so_far = sum(
        1 for d in range(1, today.day + 1)
        if date(today.year, today.month, d).weekday() < 5
    )
    if working_days_so_far > 0:
        total_possible = active_employees * working_days_so_far
        present_count  = AttendanceLog.objects.filter(
            date__year=today.year,
            date__month=today.month,
            date__lte=today,
            status__in=['present', 'late', 'half_day'],
        ).count()
        monthly_attendance_rate = round((present_count / total_possible * 100), 1) if total_possible > 0 else 0
    else:
        monthly_attendance_rate = 0

    # Open positions
    open_positions = RecruitmentPosition.objects.filter(status='open').count()

    # New hires this month
    new_hires_this_month = Employee.objects.filter(
        joining_date__year=today.year,
        joining_date__month=today.month,
    ).count()

    # Department headcount
    dept_headcount = list(
        Department.objects.annotate(
            count=Count('employees', filter=Q(employees__status='active'))
        ).values('name', 'count').order_by('-count')
    )

    # Monthly attendance trend (last 6 months)
    trend = []
    for i in range(5, -1, -1):
        # Go back i months from today
        m = today.month - i
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        _, days = calendar.monthrange(y, m)
        # Working days in that month (Mon-Fri)
        working_days = sum(
            1 for d in range(1, days + 1)
            if date(y, m, d).weekday() < 5
        )
        if working_days > 0 and active_employees > 0:
            present = AttendanceLog.objects.filter(
                date__year=y,
                date__month=m,
                status__in=['present', 'late', 'half_day'],
            ).count()
            rate = round(present / (active_employees * working_days) * 100, 1)
        else:
            rate = 0
        trend.append({
            'month': date(y, m, 1).strftime('%b %Y'),
            'rate': rate,
        })

    # Leave type distribution (current year)
    leave_dist = list(
        LeaveRequest.objects.filter(
            status='approved',
            start_date__year=today.year,
        ).values('leave_type').annotate(count=Count('id')).order_by('-count')
    )

    return Response({
        'total_employees':         total_employees,
        'active_employees':        active_employees,
        'inactive_employees':      inactive_employees,
        'on_leave_today':          on_leave_today,
        'pending_leave_requests':  pending_leave_requests,
        'monthly_attendance_rate': monthly_attendance_rate,
        'open_positions':          open_positions,
        'new_hires_this_month':    new_hires_this_month,
        'department_headcount':    dept_headcount,
        'monthly_attendance_trend': trend,
        'leave_type_distribution': leave_dist,
    })


# ── Leave ─────────────────────────────────────────────────────────────────────

class LeaveListCreateView(generics.ListCreateAPIView):
    serializer_class   = LeaveRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs  = LeaveRequest.objects.select_related('employee', 'employee__department', 'reviewed_by')
        user = self.request.user

        # Employees see only their own; HR/admin/founder see all
        if not user.is_hr_or_above:
            try:
                emp = user.employee_profile
                qs = qs.filter(employee=emp)
            except Exception:
                return LeaveRequest.objects.none()

        # Filters
        params = self.request.query_params
        if params.get('employee'):
            qs = qs.filter(employee_id=params['employee'])
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        if params.get('leave_type'):
            qs = qs.filter(leave_type=params['leave_type'])
        if params.get('start_date'):
            qs = qs.filter(start_date__gte=params['start_date'])
        if params.get('end_date'):
            qs = qs.filter(end_date__lte=params['end_date'])
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        employee = None

        # HR/above can submit leave on behalf of any employee via employee_id
        if user.is_hr_or_above:
            employee_id = self.request.data.get('employee_id')
            if employee_id:
                from apps.employees.models import Employee as EmpModel
                try:
                    employee = EmpModel.objects.get(id=employee_id)
                except EmpModel.DoesNotExist:
                    from rest_framework.exceptions import ValidationError
                    raise ValidationError({'employee_id': 'Employee not found.'})

        # Fall back to the submitting user's own profile
        if employee is None:
            try:
                employee = user.employee_profile
            except Exception:
                from rest_framework.exceptions import ValidationError
                raise ValidationError(
                    'No employee profile linked to your account. '
                    'Please select an employee from the dropdown.'
                )

        leave = serializer.save(employee=employee)

        # Ensure leave balance record exists
        _ensure_leave_balance(employee, leave.leave_type, leave.start_date.year)

        # Notify HR/admin/founder
        from apps.authentication.models import User as AuthUser
        hr_users = AuthUser.objects.filter(role__in=['hr', 'admin', 'founder'], is_active=True)
        for hr_user in hr_users:
            if hr_user != user:
                create_notification(
                    recipient=hr_user,
                    title='New Leave Request',
                    message=f'{employee.full_name} submitted {leave.get_leave_type_display()} ({leave.num_days} days)',
                    type='system',
                    priority='normal',
                    target_type='leave',
                    target_id=leave.id,
                    link='/hr/leave',
                )

        log_activity(
            actor=user,
            verb='leave_submitted',
            description=f'{employee.full_name} submitted {leave.get_leave_type_display()} leave request',
            target_type='leave',
            target_id=leave.id,
            target_name=employee.full_name,
            ip_address=get_client_ip(self.request),
        )


class LeaveDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class   = LeaveRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_hr_or_above:
            return LeaveRequest.objects.all()
        try:
            return LeaveRequest.objects.filter(employee=user.employee_profile)
        except Exception:
            return LeaveRequest.objects.none()


@api_view(['POST'])
@permission_classes([IsHROrAbove])
def approve_leave(request, pk):
    try:
        leave = LeaveRequest.objects.get(pk=pk)
    except LeaveRequest.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    if leave.status != 'pending':
        return Response({'detail': f'Leave is already {leave.status}.'}, status=status.HTTP_400_BAD_REQUEST)

    comment = request.data.get('comment', '')
    leave.status         = 'approved'
    leave.reviewed_by    = request.user
    leave.review_comment = comment
    leave.reviewed_at    = timezone.now()
    leave.save()

    # Update leave balance
    balance = _ensure_leave_balance(leave.employee, leave.leave_type, leave.start_date.year)
    balance.used_days = db_models.F('used_days') + leave.num_days
    balance.save(update_fields=['used_days'])

    # Notify employee
    try:
        emp_user = leave.employee.user
        create_notification(
            recipient=emp_user,
            title='Leave Request Approved',
            message=f'Your {leave.get_leave_type_display()} from {leave.start_date} to {leave.end_date} has been approved',
            type='system',
            priority='normal',
            target_type='leave',
            target_id=leave.id,
            link='/hr/leave',
        )
    except Exception:
        pass

    log_activity(
        actor=request.user,
        verb='leave_approved',
        description=f'{request.user.full_name} approved leave for {leave.employee.full_name}',
        target_type='leave',
        target_id=leave.id,
        target_name=leave.employee.full_name,
        ip_address=get_client_ip(request),
    )

    return Response(LeaveRequestSerializer(leave, context={'request': request}).data)


@api_view(['POST'])
@permission_classes([IsHROrAbove])
def reject_leave(request, pk):
    try:
        leave = LeaveRequest.objects.get(pk=pk)
    except LeaveRequest.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    if leave.status != 'pending':
        return Response({'detail': f'Leave is already {leave.status}.'}, status=status.HTTP_400_BAD_REQUEST)

    comment = request.data.get('comment', '').strip()
    if not comment:
        return Response({'detail': 'A rejection comment is required.'}, status=status.HTTP_400_BAD_REQUEST)

    leave.status         = 'rejected'
    leave.reviewed_by    = request.user
    leave.review_comment = comment
    leave.reviewed_at    = timezone.now()
    leave.save()

    # Notify employee
    try:
        emp_user = leave.employee.user
        create_notification(
            recipient=emp_user,
            title='Leave Request Rejected',
            message=f'Your {leave.get_leave_type_display()} request has been rejected. Reason: {comment}',
            type='system',
            priority='high',
            target_type='leave',
            target_id=leave.id,
            link='/hr/leave',
        )
    except Exception:
        pass

    log_activity(
        actor=request.user,
        verb='leave_rejected',
        description=f'{request.user.full_name} rejected leave for {leave.employee.full_name}',
        target_type='leave',
        target_id=leave.id,
        target_name=leave.employee.full_name,
        ip_address=get_client_ip(request),
    )

    return Response(LeaveRequestSerializer(leave, context={'request': request}).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def leave_balance_view(request):
    """Return leave balances. HR can query any employee; employees see their own."""
    today = timezone.localtime(timezone.now()).date()
    year  = int(request.query_params.get('year', today.year))

    user = request.user
    if user.is_hr_or_above and request.query_params.get('employee'):
        try:
            employee = Employee.objects.get(pk=request.query_params['employee'])
        except Employee.DoesNotExist:
            return Response({'detail': 'Employee not found.'}, status=status.HTTP_404_NOT_FOUND)
    else:
        try:
            employee = user.employee_profile
        except Exception:
            return Response([], status=status.HTTP_200_OK)

    # Ensure all 4 balance types exist for this employee/year
    for lt in ['sick', 'casual', 'paid', 'emergency']:
        _ensure_leave_balance(employee, lt, year)

    balances = LeaveBalance.objects.filter(employee=employee, year=year)
    return Response(LeaveBalanceSerializer(balances, many=True).data)


# ── Attendance (HR view) ──────────────────────────────────────────────────────

class HRAttendanceView(generics.ListAPIView):
    serializer_class   = AttendanceLogSerializer
    permission_classes = [IsHROrAbove]

    def get_queryset(self):
        qs     = AttendanceLog.objects.select_related('employee', 'employee__department')
        params = self.request.query_params

        if params.get('date'):
            qs = qs.filter(date=params['date'])
        if params.get('employee'):
            qs = qs.filter(employee_id=params['employee'])
        if params.get('department'):
            qs = qs.filter(employee__department_id=params['department'])
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        if params.get('start_date'):
            qs = qs.filter(date__gte=params['start_date'])
        if params.get('end_date'):
            qs = qs.filter(date__lte=params['end_date'])

        return qs.order_by('-date', 'employee__full_name')


@api_view(['GET'])
@permission_classes([IsHROrAbove])
def attendance_export_view(request):
    """Export attendance data as CSV."""
    today  = timezone.localtime(timezone.now()).date()
    month  = int(request.query_params.get('month', today.month))
    year   = int(request.query_params.get('year',  today.year))
    dept   = request.query_params.get('department')

    qs = AttendanceLog.objects.select_related(
        'employee', 'employee__department'
    ).filter(date__year=year, date__month=month)
    if dept:
        qs = qs.filter(employee__department_id=dept)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        'Employee ID', 'Employee Name', 'Department', 'Date',
        'Login Time', 'Logout Time', 'Hours Worked', 'Status',
    ])
    for log in qs.order_by('employee__full_name', 'date'):
        from django.utils import timezone as tz
        login_str  = tz.localtime(log.login_time).strftime('%H:%M')  if log.login_time  else ''
        logout_str = tz.localtime(log.logout_time).strftime('%H:%M') if log.logout_time else ''
        writer.writerow([
            log.employee.employee_id,
            log.employee.full_name,
            log.employee.department.name if log.employee.department else '',
            log.date.strftime('%Y-%m-%d'),
            login_str,
            logout_str,
            str(log.total_work_hours),
            log.status,
        ])

    response = HttpResponse(buf.getvalue(), content_type='text/csv')
    response['Content-Disposition'] = (
        f'attachment; filename="attendance_{year}_{month:02d}.csv"'
    )
    return response


# ── HR Documents ──────────────────────────────────────────────────────────────

class HRDocumentListCreateView(generics.ListCreateAPIView):
    serializer_class   = HRDocumentSerializer

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsHROrAbove()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = HRDocument.objects.select_related('employee', 'uploaded_by', 'reviewed_by')
        p  = self.request.query_params
        if p.get('employee'):
            qs = qs.filter(employee_id=p['employee'])
        if p.get('doc_type'):
            qs = qs.filter(doc_type=p['doc_type'])
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        return qs

    def perform_create(self, serializer):
        file = self.request.FILES.get('file')
        size = file.size if file else 0
        doc  = serializer.save(
            uploaded_by=self.request.user,
            file_size=size,
        )

        log_activity(
            actor=self.request.user,
            verb='document_uploaded',
            description=f'{doc.employee.full_name} uploaded {doc.get_doc_type_display()} document',
            target_type='document',
            target_id=doc.id,
            target_name=doc.title,
            ip_address=get_client_ip(self.request),
        )


class HRDocumentDetailView(generics.RetrieveUpdateAPIView):
    serializer_class   = HRDocumentSerializer
    permission_classes = [IsHROrAbove]
    queryset           = HRDocument.objects.all()

    def partial_update(self, request, *args, **kwargs):
        doc = self.get_object()
        new_status = request.data.get('status')
        notes      = request.data.get('review_notes', '')

        if new_status not in ('approved', 'rejected'):
            return Response(
                {'detail': 'status must be "approved" or "rejected".'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        doc.status       = new_status
        doc.reviewed_by  = request.user
        doc.review_notes = notes
        doc.reviewed_at  = timezone.now()
        doc.save(update_fields=['status', 'reviewed_by', 'review_notes', 'reviewed_at'])

        # Notify document owner
        try:
            create_notification(
                recipient=doc.employee.user,
                title=f'Document {new_status.capitalize()}',
                message=f'Your {doc.get_doc_type_display()} "{doc.title}" has been {new_status}',
                type='system',
                priority='normal' if new_status == 'approved' else 'high',
                target_type='document',
                target_id=doc.id,
                link='/hr/documents',
            )
        except Exception:
            pass

        return Response(HRDocumentSerializer(doc, context={'request': request}).data)


# ── Performance Reports ───────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsHROrAbove])
def hr_reports_view(request):
    """Return per-employee performance summary for a date range."""
    today  = timezone.localtime(timezone.now()).date()
    period = request.query_params.get('period', 'monthly')

    if period == 'weekly':
        start_date = today - timedelta(days=today.weekday())
        end_date   = today
    elif period == 'custom':
        start_str  = request.query_params.get('start_date')
        end_str    = request.query_params.get('end_date')
        try:
            from datetime import datetime
            start_date = datetime.strptime(start_str, '%Y-%m-%d').date()
            end_date   = datetime.strptime(end_str,   '%Y-%m-%d').date()
        except (TypeError, ValueError):
            return Response({'detail': 'Provide start_date and end_date (YYYY-MM-DD).'}, status=400)
    else:  # monthly
        start_date = today.replace(day=1)
        end_date   = today

    employees_qs = Employee.objects.select_related('department').filter(status='active')
    if request.query_params.get('department'):
        employees_qs = employees_qs.filter(department_id=request.query_params['department'])
    if request.query_params.get('employee'):
        employees_qs = employees_qs.filter(pk=request.query_params['employee'])

    # Count working days in range
    total_days = 0
    d = start_date
    while d <= end_date:
        if d.weekday() < 5:
            total_days += 1
        d += timedelta(days=1)

    results = []
    for emp in employees_qs:
        # Tasks
        total_tasks     = emp.assigned_tasks.count()
        completed_tasks = emp.assigned_tasks.filter(status='completed').count()
        task_rate       = round(completed_tasks / total_tasks * 100, 1) if total_tasks else 0

        # Hours logged
        hours_logged = DailyWorkLog.objects.filter(
            employee=emp,
            date__range=(start_date, end_date),
        ).aggregate(total=Sum('hours_worked'))['total'] or 0

        # Attendance
        att_qs = AttendanceLog.objects.filter(
            employee=emp,
            date__range=(start_date, end_date),
        )
        days_present = att_qs.filter(status__in=['present', 'late', 'half_day']).count()
        att_rate     = round(days_present / total_days * 100, 1) if total_days else 0

        # Leave days taken
        leave_days = 0
        for lr in LeaveRequest.objects.filter(
            employee=emp,
            status='approved',
            start_date__lte=end_date,
            end_date__gte=start_date,
        ):
            # Clamp to the report range
            eff_start = max(lr.start_date, start_date)
            eff_end   = min(lr.end_date, end_date)
            leave_days += (eff_end - eff_start).days + 1

        results.append({
            'employee_id':          emp.id,
            'employee_code':        emp.employee_id,
            'employee_name':        emp.full_name,
            'department':           emp.department.name if emp.department else None,
            'total_tasks':          total_tasks,
            'completed_tasks':      completed_tasks,
            'task_completion_rate': task_rate,
            'hours_logged':         float(hours_logged),
            'attendance_days_present': days_present,
            'attendance_rate':      att_rate,
            'leave_days_taken':     leave_days,
        })

    return Response({
        'period':     period,
        'start_date': str(start_date),
        'end_date':   str(end_date),
        'results':    results,
    })


# ── Recruitment ───────────────────────────────────────────────────────────────

class RecruitmentPositionListCreate(generics.ListCreateAPIView):
    serializer_class   = RecruitmentPositionSerializer
    permission_classes = [IsHROrAbove]

    def get_queryset(self):
        qs = RecruitmentPosition.objects.annotate(
            _applicant_count=Count('applicants')
        ).select_related('department', 'created_by')
        p  = self.request.query_params
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        if p.get('department'):
            qs = qs.filter(department_id=p['department'])
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class RecruitmentPositionDetail(generics.RetrieveUpdateDestroyAPIView):
    serializer_class   = RecruitmentPositionSerializer
    permission_classes = [IsHROrAbove]
    queryset           = RecruitmentPosition.objects.all()


class ApplicantListCreate(generics.ListCreateAPIView):
    serializer_class   = ApplicantSerializer
    permission_classes = [IsHROrAbove]

    def get_queryset(self):
        position_pk = self.kwargs.get('pk')
        return Applicant.objects.filter(position_id=position_pk)

    def perform_create(self, serializer):
        position_pk = self.kwargs.get('pk')
        try:
            position = RecruitmentPosition.objects.get(pk=position_pk)
        except RecruitmentPosition.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound('Position not found.')
        applicant = serializer.save(position=position)

        log_activity(
            actor=self.request.user,
            verb='applicant_added',
            description=f'New applicant {applicant.full_name} added for {position.title}',
            target_type='recruitment',
            target_id=applicant.id,
            target_name=applicant.full_name,
            ip_address=get_client_ip(self.request),
        )


class ApplicantDetail(generics.RetrieveUpdateAPIView):
    serializer_class   = ApplicantSerializer
    permission_classes = [IsHROrAbove]
    queryset           = Applicant.objects.all()

    def perform_update(self, serializer):
        applicant = serializer.save()
        if applicant.status == 'hired':
            log_activity(
                actor=self.request.user,
                verb='applicant_hired',
                description=f'{applicant.full_name} was hired for {applicant.position.title}',
                target_type='recruitment',
                target_id=applicant.id,
                target_name=applicant.full_name,
                ip_address=get_client_ip(self.request),
            )


# ── Payroll Dashboard ─────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsHROrAbove])
def payroll_dashboard(request):
    """Aggregated payroll stats for HR dashboard. Defaults to current month/year."""
    today = timezone.localtime(timezone.now()).date()
    try:
        month = int(request.query_params.get('month', today.month))
        year  = int(request.query_params.get('year',  today.year))
    except (ValueError, TypeError):
        month, year = today.month, today.year

    payments_qs = SalaryPayment.objects.filter(month=month, year=year)

    # Filter by department if requested
    dept_filter = request.query_params.get('department')
    if dept_filter:
        payments_qs = payments_qs.filter(employee__department_id=dept_filter)

    total_payroll      = payments_qs.aggregate(total=Sum('amount_paid'))['total'] or Decimal('0.00')
    employees_paid     = payments_qs.filter(payment_status='paid').count()
    pending_payments   = payments_qs.filter(payment_status='pending').count()

    total_with_structure = SalaryStructure.objects.count()
    unpaid_employees     = max(total_with_structure - employees_paid, 0)

    # Payroll by department (paid payments)
    payroll_by_dept = list(
        payments_qs.filter(payment_status='paid')
        .values(dept_name=db_models.F('employee__department__name'))
        .annotate(total=Sum('amount_paid'))
        .order_by('-total')
    )
    for row in payroll_by_dept:
        row['dept_name'] = row['dept_name'] or 'Unassigned'
        row['total'] = float(row['total'])

    # Monthly trend — last 6 months
    monthly_trend = []
    for i in range(5, -1, -1):
        m, y = month - i, year
        while m <= 0:
            m += 12
            y -= 1
        month_total = SalaryPayment.objects.filter(
            month=m, year=y, payment_status='paid'
        ).aggregate(total=Sum('amount_paid'))['total'] or Decimal('0.00')
        monthly_trend.append({
            'month': f'{calendar.month_abbr[m]} {y}',
            'total': float(month_total),
        })

    # Per-employee rows
    structures_qs = SalaryStructure.objects.select_related(
        'employee', 'employee__department', 'employee__bank_details'
    )
    if dept_filter:
        structures_qs = structures_qs.filter(employee__department_id=dept_filter)

    payment_map = {p.employee_id: p for p in payments_qs.select_related('employee')}
    status_filter = request.query_params.get('payment_status')

    employee_rows = []
    for ss in structures_qs:
        payment = payment_map.get(ss.employee_id)
        pstatus = payment.payment_status if payment else 'not_generated'
        if status_filter and pstatus != status_filter:
            continue
        employee_rows.append({
            'employee_id':    ss.employee.id,
            'employee_code':  ss.employee.employee_id,
            'employee_name':  ss.employee.full_name,
            'department':     ss.employee.department.name if ss.employee.department else None,
            'base_salary':    float(ss.base_salary),
            'deductions':     float((ss.deductions or Decimal('0')) + (ss.tax or Decimal('0'))),
            'net_salary':     float(ss.net_salary),
            'payment_status': pstatus,
            'payment_id':     payment.id if payment else None,
            'has_payslip':    hasattr(payment, 'payslip') if payment else False,
            'payslip_auto_generated': payment.payslip.is_auto_generated if (payment and hasattr(payment, 'payslip')) else None,
            'bank_status':          getattr(getattr(ss.employee, 'bank_details', None), 'status', None),
            'bank_name':            getattr(getattr(ss.employee, 'bank_details', None), 'bank_name', None),
            'account_holder_name':  getattr(getattr(ss.employee, 'bank_details', None), 'account_holder_name', None),
            'account_number':       getattr(getattr(ss.employee, 'bank_details', None), 'account_number', None),
            'ifsc_code':            getattr(getattr(ss.employee, 'bank_details', None), 'ifsc_code', None),
            'branch_name':          getattr(getattr(ss.employee, 'bank_details', None), 'branch_name', None),
            'upi_id':               getattr(getattr(ss.employee, 'bank_details', None), 'upi_id', None),
            'passbook_photo_url':   ss.employee.bank_details.passbook_photo.url if (hasattr(ss.employee, 'bank_details') and ss.employee.bank_details and ss.employee.bank_details.passbook_photo) else None,
        })

    return Response({
        'month':                 month,
        'year':                  year,
        'total_payroll':         float(total_payroll),
        'employees_paid':        employees_paid,
        'pending_payments':      pending_payments,
        'unpaid_employees':      unpaid_employees,
        'payroll_by_department': payroll_by_dept,
        'monthly_trend':         monthly_trend,
        'employee_rows':         employee_rows,
    })


# ── Salary Structure ──────────────────────────────────────────────────────────

class SalaryListCreateView(generics.ListCreateAPIView):
    serializer_class = SalaryStructureSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsHROrAbove()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        qs   = SalaryStructure.objects.select_related(
            'employee', 'employee__department', 'created_by', 'updated_by'
        )
        if not user.is_hr_or_above:
            try:
                qs = qs.filter(employee=user.employee_profile)
            except Exception:
                return SalaryStructure.objects.none()
        else:
            p = self.request.query_params
            if p.get('employee'):
                qs = qs.filter(employee_id=p['employee'])
            if p.get('department'):
                qs = qs.filter(employee__department_id=p['department'])
            if p.get('search'):
                qs = qs.filter(employee__full_name__icontains=p['search'])
        return qs

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user, updated_by=self.request.user)
        log_activity(
            actor=self.request.user,
            verb='salary_structure_created',
            description=f'Salary structure created for {instance.employee.full_name}',
            target_type='salary',
            target_id=instance.id,
            target_name=instance.employee.full_name,
            ip_address=get_client_ip(self.request),
        )


class SalaryDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = SalaryStructureSerializer

    def get_permissions(self):
        if self.request.method in ('PUT', 'PATCH'):
            return [IsHROrAbove()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        qs   = SalaryStructure.objects.select_related(
            'employee', 'employee__department', 'created_by', 'updated_by'
        )
        if not user.is_hr_or_above:
            try:
                return qs.filter(employee=user.employee_profile)
            except Exception:
                return SalaryStructure.objects.none()
        return qs

    def perform_update(self, serializer):
        instance = serializer.save(updated_by=self.request.user)
        log_activity(
            actor=self.request.user,
            verb='salary_updated',
            description=f'Salary structure updated for {instance.employee.full_name}',
            target_type='salary',
            target_id=instance.id,
            target_name=instance.employee.full_name,
            ip_address=get_client_ip(self.request),
        )


# ── Bank Details ──────────────────────────────────────────────────────────────

def _mask_sensitive(field_name, value):
    """Mask account_number and pan_number for change logs."""
    if not value:
        return value
    if field_name == 'account_number' and len(value) >= 4:
        return f'****{value[-4:]}'
    if field_name == 'pan_number' and len(value) >= 4:
        return f'****{value[-4:]}'
    return value


def _log_bank_changes(instance, user, old_data, change_type='updated'):
    """Create BankDetailsChangeLog entries for changed fields."""
    tracked = ['account_holder_name', 'bank_name', 'account_number',
               'ifsc_code', 'branch_name', 'upi_id', 'pan_number']
    for field in tracked:
        new_val = getattr(instance, field, '') or ''
        old_val = old_data.get(field, '') or ''
        if new_val != old_val:
            BankDetailsChangeLog.objects.create(
                bank_details=instance,
                changed_by=user,
                field_name=field,
                old_value=_mask_sensitive(field, old_val),
                new_value=_mask_sensitive(field, new_val),
                change_type=change_type,
            )


def _notify_hr_bank(instance, action='submitted'):
    from apps.authentication.models import User as AuthUser
    hr_users = AuthUser.objects.filter(role__in=['founder', 'admin', 'hr'], is_active=True)
    title = 'Bank Details Submitted' if action == 'submitted' else 'Bank Details Updated'
    for hr_user in hr_users:
        create_notification(
            recipient=hr_user,
            title=title,
            message=f'{instance.employee.full_name} has {action} their bank details for review.',
            type='system',
            priority='normal',
            target_type='bank_details',
            target_id=instance.id,
            link='/hr/bank-details',
        )


class BankDetailsListCreateView(generics.ListCreateAPIView):
    serializer_class = EmployeeBankDetailsSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs   = EmployeeBankDetails.objects.select_related(
            'employee', 'employee__department', 'reviewed_by',
        )
        p = self.request.query_params

        # ?mine=true — return only the current user's own bank details
        if p.get('mine') == 'true':
            try:
                return qs.filter(employee=user.employee_profile)
            except Exception:
                return EmployeeBankDetails.objects.none()

        if not user.is_hr_or_above:
            try:
                return qs.filter(employee=user.employee_profile)
            except Exception:
                return EmployeeBankDetails.objects.none()
        if p.get('employee'):
            qs = qs.filter(employee_id=p['employee'])
        if p.get('department'):
            qs = qs.filter(employee__department_id=p['department'])
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        if p.get('search'):
            qs = qs.filter(
                db_models.Q(employee__full_name__icontains=p['search']) |
                db_models.Q(bank_name__icontains=p['search'])
            )
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        extra = {}

        if not user.is_hr_or_above:
            try:
                extra['employee'] = user.employee_profile
            except Exception:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('No employee profile found.')
            extra['status'] = 'pending'
        else:
            extra['status'] = 'approved'
            extra['reviewed_by'] = user
            extra['reviewed_at'] = timezone.now()

        instance = serializer.save(**extra)

        # Log all initial field values as 'created' change entries
        _log_bank_changes(instance, user, {}, change_type='created')

        log_activity(
            actor=user,
            verb='bank_details_updated',
            description=f'Bank details added for {instance.employee.full_name}',
            target_type='bank_details',
            target_id=instance.id,
            target_name=instance.employee.full_name,
            ip_address=get_client_ip(self.request),
        )

        if not user.is_hr_or_above:
            _notify_hr_bank(instance, action='submitted')


class BankDetailsDetailView(generics.RetrieveUpdateAPIView):
    serializer_class   = EmployeeBankDetailsSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs   = EmployeeBankDetails.objects.select_related(
            'employee', 'employee__department', 'reviewed_by',
        )
        if not user.is_hr_or_above:
            try:
                return qs.filter(employee=user.employee_profile)
            except Exception:
                return EmployeeBankDetails.objects.none()
        return qs

    def perform_update(self, serializer):
        instance = serializer.instance
        user = self.request.user

        # Capture old values before save
        old_data = {
            'account_holder_name': instance.account_holder_name,
            'bank_name':           instance.bank_name,
            'account_number':      instance.account_number,
            'ifsc_code':           instance.ifsc_code,
            'branch_name':         instance.branch_name,
            'upi_id':              instance.upi_id,
            'pan_number':          instance.pan_number,
        }

        extra = {}
        if not user.is_hr_or_above:
            extra['status'] = 'pending'
            extra['review_note'] = ''

        instance = serializer.save(**extra)

        _log_bank_changes(instance, user, old_data, change_type='updated')

        log_activity(
            actor=user,
            verb='bank_details_updated',
            description=f'Bank details updated for {instance.employee.full_name}',
            target_type='bank_details',
            target_id=instance.id,
            target_name=instance.employee.full_name,
            ip_address=get_client_ip(self.request),
        )

        if not user.is_hr_or_above:
            _notify_hr_bank(instance, action='updated')


@api_view(['PATCH'])
@permission_classes([IsHROrAbove])
def bank_details_review(request, pk):
    """Approve or reject bank details. PATCH /api/hr/bank-details/<pk>/review/"""
    try:
        bd = EmployeeBankDetails.objects.select_related('employee').get(pk=pk)
    except EmployeeBankDetails.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    action = request.data.get('action')
    if action not in ('approve', 'reject'):
        return Response({'detail': 'action must be "approve" or "reject".'}, status=status.HTTP_400_BAD_REQUEST)

    bd.status      = 'approved' if action == 'approve' else 'rejected'
    bd.reviewed_by = request.user
    bd.reviewed_at = timezone.now()
    bd.review_note = request.data.get('review_note', '')
    bd.save()

    # Notify the employee
    emp_user = bd.employee.user
    status_label = 'approved' if action == 'approve' else 'rejected'
    create_notification(
        recipient=emp_user,
        title=f'Bank Details {status_label.title()}',
        message=f'Your bank details have been {status_label} by {request.user.full_name}.'
                + (f' Note: {bd.review_note}' if bd.review_note else ''),
        type='system',
        priority='normal',
        target_type='bank_details',
        target_id=bd.id,
        link='/my-bank-details',
    )

    log_activity(
        actor=request.user,
        verb='bank_details_reviewed',
        description=f'Bank details {status_label} for {bd.employee.full_name}',
        target_type='bank_details',
        target_id=bd.id,
        target_name=bd.employee.full_name,
        ip_address=get_client_ip(request),
    )

    return Response(EmployeeBankDetailsSerializer(bd, context={'request': request}).data)


@api_view(['GET'])
@permission_classes([IsHROrAbove])
def bank_details_change_logs(request, pk):
    """Get change history for a bank detail record. GET /api/hr/bank-details/<pk>/history/"""
    logs = BankDetailsChangeLog.objects.filter(
        bank_details_id=pk,
    ).select_related('changed_by').order_by('-changed_at')
    return Response(BankDetailsChangeLogSerializer(logs, many=True).data)


@api_view(['GET'])
@permission_classes([IsHROrAbove])
def bank_details_export(request):
    """Export bank details as CSV. GET /api/hr/bank-details/export/"""
    qs = EmployeeBankDetails.objects.select_related(
        'employee', 'employee__department',
    ).order_by('employee__full_name')

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        'Employee ID', 'Employee Name', 'Department', 'Bank Name',
        'Account Number', 'IFSC Code', 'Branch', 'UPI ID',
        'PAN Number', 'Status', 'Last Updated',
    ])
    for bd in qs:
        acct = bd.account_number
        acct_masked = f'****{acct[-4:]}' if len(acct) >= 4 else '****'
        pan  = bd.pan_number or ''
        pan_masked  = f'****{pan[-4:]}' if len(pan) >= 4 else (pan or '—')
        writer.writerow([
            bd.employee.employee_id,
            bd.employee.full_name,
            bd.employee.department.name if bd.employee.department else '—',
            bd.bank_name,
            acct_masked,
            bd.ifsc_code,
            bd.branch_name or '—',
            bd.upi_id or '—',
            pan_masked,
            bd.status,
            bd.updated_at.strftime('%Y-%m-%d %H:%M'),
        ])

    resp = HttpResponse(buf.getvalue(), content_type='text/csv')
    resp['Content-Disposition'] = 'attachment; filename="bank_details_export.csv"'
    return resp


# ── Salary Payments ───────────────────────────────────────────────────────────

class PaymentListCreateView(generics.ListCreateAPIView):
    serializer_class   = SalaryPaymentSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsHROrAbove()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        qs   = SalaryPayment.objects.select_related('employee', 'employee__department', 'processed_by')
        if not user.is_hr_or_above:
            try:
                qs = qs.filter(employee=user.employee_profile)
            except Exception:
                return SalaryPayment.objects.none()
        else:
            p = self.request.query_params
            if p.get('employee'):
                qs = qs.filter(employee_id=p['employee'])
            if p.get('month'):
                qs = qs.filter(month=p['month'])
            if p.get('year'):
                qs = qs.filter(year=p['year'])
            if p.get('status'):
                qs = qs.filter(payment_status=p['status'])
            if p.get('department'):
                qs = qs.filter(employee__department_id=p['department'])
        return qs

    def create(self, request, *args, **kwargs):
        try:
            return super().create(request, *args, **kwargs)
        except IntegrityError:
            return Response(
                {'detail': 'A payment record for this employee in that month/year already exists.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def perform_create(self, serializer):
        payment = serializer.save()
        user = self.request.user

        # If created directly as 'paid', auto-generate payslip + rich notification
        if payment.payment_status == 'paid':
            if not payment.processed_by:
                payment.processed_by = user
            if not payment.payment_date:
                payment.payment_date = timezone.localtime(timezone.now()).date()
            payment.save(update_fields=['processed_by', 'payment_date'])

            # Reload with related objects for bank details
            payment = SalaryPayment.objects.select_related(
                'employee', 'employee__bank_details', 'employee__salary_structure',
            ).get(pk=payment.pk)

            payslip, _ = _create_payslip_for_payment(payment, user, is_auto=True)
            if payslip:
                log_activity(
                    actor=user, verb='payslip_generated',
                    description=f'Payslip auto-generated for {payment.employee.full_name} ({payment.month}/{payment.year})',
                    target_type='payslip', target_id=payslip.id,
                    target_name=payment.employee.full_name,
                    ip_address=get_client_ip(self.request),
                )

            month_name = calendar.month_name[payment.month]
            base_msg = f'Your salary of ₹{payment.amount_paid} for {month_name} {payment.year}'
            bank_info = ' has been paid'
            try:
                bank = payment.employee.bank_details
                if bank.account_number:
                    tail = bank.account_number[-4:] if len(bank.account_number) >= 4 else '****'
                    bank_info = f' has been credited to your {bank.bank_name} account (****{tail})'
            except EmployeeBankDetails.DoesNotExist:
                pass
            payslip_info = '. Your payslip is ready for download.' if payslip else '.'

            try:
                create_notification(
                    recipient=payment.employee.user,
                    title='Salary Paid',
                    message=base_msg + bank_info + payslip_info,
                    type='system', priority='high',
                    target_type='payment', target_id=payment.id,
                    link='/payslips',
                )
            except Exception:
                pass
        else:
            try:
                create_notification(
                    recipient=payment.employee.user,
                    title='Salary Payment Initiated',
                    message=f'Your salary for {calendar.month_name[payment.month]} {payment.year} has been recorded.',
                    type='system', priority='normal',
                    target_type='payment', target_id=payment.id,
                    link='/payslips',
                )
            except Exception:
                pass

        log_activity(
            actor=user,
            verb='salary_paid' if payment.payment_status == 'paid' else 'salary_payment_created',
            description=f'Salary {"paid to" if payment.payment_status == "paid" else "payment created for"} {payment.employee.full_name} ({payment.month}/{payment.year})',
            target_type='payment',
            target_id=payment.id,
            target_name=payment.employee.full_name,
            ip_address=get_client_ip(self.request),
        )


class PaymentDetailView(generics.RetrieveUpdateAPIView):
    serializer_class   = SalaryPaymentSerializer
    permission_classes = [IsHROrAbove]

    def get_queryset(self):
        return SalaryPayment.objects.select_related(
            'employee', 'employee__department', 'employee__bank_details',
            'employee__salary_structure', 'processed_by',
        )

    def perform_update(self, serializer):
        old_status = self.get_object().payment_status
        payment    = serializer.save()

        if old_status != 'paid' and payment.payment_status == 'paid':
            # Set processor and date if not already set
            update_fields = []
            if not payment.processed_by:
                payment.processed_by = self.request.user
                update_fields.append('processed_by')
            if not payment.payment_date:
                payment.payment_date = timezone.localtime(timezone.now()).date()
                update_fields.append('payment_date')
            if update_fields:
                payment.save(update_fields=update_fields)

            # Auto-generate payslip
            payslip, _ = _create_payslip_for_payment(
                payment, self.request.user, is_auto=True,
            )
            if payslip:
                log_activity(
                    actor=self.request.user,
                    verb='payslip_generated',
                    description=(
                        f'Payslip auto-generated for {payment.employee.full_name} '
                        f'({payment.month}/{payment.year})'
                    ),
                    target_type='payslip',
                    target_id=payslip.id,
                    target_name=payment.employee.full_name,
                    ip_address=get_client_ip(self.request),
                )

            # Build rich notification with bank info
            month_name = calendar.month_name[payment.month]
            base_msg = f'Your salary of ₹{payment.amount_paid} for {month_name} {payment.year}'

            bank_info = ' has been paid'
            try:
                bank = payment.employee.bank_details
                if bank.account_number:
                    tail = bank.account_number[-4:] if len(bank.account_number) >= 4 else '****'
                    bank_info = f' has been credited to your {bank.bank_name} account (****{tail})'
            except EmployeeBankDetails.DoesNotExist:
                pass

            payslip_info = '. Your payslip is ready for download.' if payslip else '.'
            message = base_msg + bank_info + payslip_info

            try:
                create_notification(
                    recipient=payment.employee.user,
                    title='Salary Paid',
                    message=message,
                    type='system',
                    priority='high',
                    target_type='payment',
                    target_id=payment.id,
                    link='/payslips',
                )
            except Exception:
                pass

            log_activity(
                actor=self.request.user,
                verb='salary_paid',
                description=(
                    f'Salary paid to {payment.employee.full_name} '
                    f'for {payment.month}/{payment.year}'
                ),
                target_type='payment',
                target_id=payment.id,
                target_name=payment.employee.full_name,
                ip_address=get_client_ip(self.request),
            )


# ── Payslips ──────────────────────────────────────────────────────────────────

def _create_payslip_for_payment(payment, generated_by_user, is_auto=False):
    """Create a payslip for a payment. Returns (payslip, error_string)."""
    if hasattr(payment, 'payslip'):
        return payment.payslip, None
    try:
        ss = payment.employee.salary_structure
    except SalaryStructure.DoesNotExist:
        return None, 'No salary structure found for this employee.'
    payslip = Payslip.objects.create(
        employee          = payment.employee,
        payment           = payment,
        base_salary       = ss.base_salary,
        hra               = ss.hra,
        allowances        = ss.allowances,
        bonus             = ss.bonus,
        deductions        = ss.deductions,
        tax               = ss.tax,
        net_salary        = ss.net_salary,
        generated_by      = generated_by_user,
        is_auto_generated = is_auto,
    )
    return payslip, None

class PayslipListView(generics.ListAPIView):
    serializer_class   = PayslipSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs   = Payslip.objects.select_related(
            'employee', 'employee__department', 'payment', 'generated_by'
        )
        if not user.is_hr_or_above:
            try:
                qs = qs.filter(employee=user.employee_profile)
            except Exception:
                return Payslip.objects.none()
        else:
            p = self.request.query_params
            if p.get('employee'):
                qs = qs.filter(employee_id=p['employee'])
            if p.get('month'):
                qs = qs.filter(payment__month=p['month'])
            if p.get('year'):
                qs = qs.filter(payment__year=p['year'])
        return qs


@api_view(['POST'])
@permission_classes([IsHROrAbove])
def generate_payslip(request):
    """Generate a payslip for a salary payment. Snapshots salary data at this moment."""
    payment_id = request.data.get('payment_id')
    if not payment_id:
        return Response({'detail': 'payment_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        payment = SalaryPayment.objects.select_related(
            'employee', 'employee__department', 'employee__salary_structure'
        ).get(pk=payment_id)
    except SalaryPayment.DoesNotExist:
        return Response({'detail': 'Payment not found.'}, status=status.HTTP_404_NOT_FOUND)

    if hasattr(payment, 'payslip'):
        return Response({'detail': 'Payslip already generated for this payment.'}, status=status.HTTP_400_BAD_REQUEST)

    payslip, error = _create_payslip_for_payment(payment, request.user, is_auto=False)
    if error:
        return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

    try:
        month_name = calendar.month_name[payment.month]
        create_notification(
            recipient=payment.employee.user,
            title='Payslip Generated',
            message=f'Your payslip for {month_name} {payment.year} is now available.',
            type='system',
            priority='normal',
            target_type='payslip',
            target_id=payslip.id,
            link='/payslips',
        )
    except Exception:
        pass

    log_activity(
        actor=request.user,
        verb='payslip_generated',
        description=f'Payslip generated for {payment.employee.full_name} ({payment.month}/{payment.year})',
        target_type='payslip',
        target_id=payslip.id,
        target_name=payment.employee.full_name,
        ip_address=get_client_ip(request),
    )

    serializer = PayslipSerializer(payslip, context={'request': request})
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def payslip_download(request, pk):
    """Generate and return a PDF payslip using reportlab."""
    from reportlab.lib          import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles   import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units    import cm
    from reportlab.platypus     import (
        SimpleDocTemplate, Table, TableStyle,
        Paragraph, Spacer, HRFlowable,
    )

    try:
        payslip = Payslip.objects.select_related(
            'employee', 'employee__department', 'payment'
        ).get(pk=pk)
    except Payslip.DoesNotExist:
        return Response({'detail': 'Payslip not found.'}, status=status.HTTP_404_NOT_FOUND)

    # Permission: non-HR can only download their own payslip
    if not request.user.is_hr_or_above:
        try:
            emp = request.user.employee_profile
            if payslip.employee != emp:
                return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)
        except Exception:
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)

    emp     = payslip.employee
    payment = payslip.payment
    month_name = calendar.month_name[payment.month]

    # ── Build Professional PDF ────────────────────────────────────────────
    buffer = io.BytesIO()
    doc    = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=1.5*cm, leftMargin=1.5*cm,
        topMargin=1.5*cm,   bottomMargin=1.5*cm,
    )

    styles   = getSampleStyleSheet()
    elements = []

    # ── Colors ─────────────────────────────────────────────────────────────
    DARK    = colors.HexColor('#1a1a2e')
    PRIMARY = colors.HexColor('#6366f1')
    GREY    = colors.HexColor('#6b7280')
    LIGHT_G = colors.HexColor('#f3f4f6')
    GREEN   = colors.HexColor('#059669')
    RED     = colors.HexColor('#dc2626')
    WHITE   = colors.white
    BORDER  = colors.HexColor('#d1d5db')

    page_w = A4[0] - 3*cm  # usable width

    # ── Company Header ─────────────────────────────────────────────────────
    company_name_style = ParagraphStyle('co', fontSize=24, fontName='Helvetica-Bold', textColor=PRIMARY, leading=28)
    company_addr_style = ParagraphStyle('addr', fontSize=8, fontName='Helvetica', textColor=GREY, leading=11)
    payslip_title_style = ParagraphStyle('pst', fontSize=12, fontName='Helvetica-Bold', textColor=DARK, alignment=2)
    payslip_period_style = ParagraphStyle('psp', fontSize=9, fontName='Helvetica', textColor=GREY, alignment=2)

    # Company name as separate element (not in table to avoid overlap)
    elements.append(Paragraph('PromoPe', company_name_style))
    elements.append(Spacer(1, 0.15*cm))

    header_data = [[
        Paragraph(
            'Embassy Galaxy, Sector 62, Noida<br/>'
            'Uttar Pradesh 201309, India',
            company_addr_style
        ),
        Paragraph(
            f'<b>PAYSLIP</b><br/>{month_name} {payment.year}',
            payslip_title_style
        ),
    ]]
    header_tbl = Table(header_data, colWidths=[page_w * 0.6, page_w * 0.4])
    header_tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(header_tbl)
    elements.append(Spacer(1, 0.3*cm))
    elements.append(HRFlowable(width='100%', thickness=2, color=PRIMARY))
    elements.append(Spacer(1, 0.5*cm))

    # ── Employee Info Card ─────────────────────────────────────────────────
    dept_name = emp.department.name if emp.department else '—'
    lbl = ParagraphStyle('lbl', fontSize=7, fontName='Helvetica', textColor=GREY, leading=9)
    val = ParagraphStyle('val', fontSize=9, fontName='Helvetica-Bold', textColor=DARK, leading=12)

    info_data = [
        [Paragraph('Employee Name', lbl), Paragraph('Employee ID', lbl),
         Paragraph('Department', lbl), Paragraph('Designation', lbl)],
        [Paragraph(emp.full_name, val), Paragraph(emp.employee_id, val),
         Paragraph(dept_name, val), Paragraph(emp.role or '—', val)],
    ]
    info_tbl = Table(info_data, colWidths=[page_w * 0.28, page_w * 0.22, page_w * 0.25, page_w * 0.25])
    info_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), LIGHT_G),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 1),
        ('TOPPADDING', (0, 1), (-1, 1), 1),
        ('BOTTOMPADDING', (0, 1), (-1, 1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('ROUNDEDCORNERS', [6]),
    ]))
    elements.append(info_tbl)
    elements.append(Spacer(1, 0.5*cm))

    # ── Earnings & Deductions Side-by-Side ─────────────────────────────────
    def fmt(v):
        return f'Rs. {float(v):,.2f}'

    total_earnings = (
        (payslip.base_salary or Decimal('0')) +
        (payslip.hra or Decimal('0')) +
        (payslip.allowances or Decimal('0')) +
        (payslip.bonus or Decimal('0'))
    )
    total_deductions = (payslip.deductions or Decimal('0')) + (payslip.tax or Decimal('0'))

    hdr_e = ParagraphStyle('he', fontSize=8, fontName='Helvetica-Bold', textColor=WHITE)
    hdr_d = ParagraphStyle('hd', fontSize=8, fontName='Helvetica-Bold', textColor=WHITE)
    cell_l = ParagraphStyle('cl', fontSize=8.5, fontName='Helvetica', textColor=DARK)
    cell_r = ParagraphStyle('cr', fontSize=8.5, fontName='Helvetica', textColor=DARK, alignment=2)
    cell_rb = ParagraphStyle('crb', fontSize=9, fontName='Helvetica-Bold', textColor=DARK, alignment=2)
    cell_lb = ParagraphStyle('clb', fontSize=9, fontName='Helvetica-Bold', textColor=DARK)

    half_w = page_w * 0.48

    # Earnings table
    earn_rows = [
        [Paragraph('EARNINGS', hdr_e), Paragraph('AMOUNT', hdr_e)],
        [Paragraph('Base Salary', cell_l), Paragraph(fmt(payslip.base_salary), cell_r)],
        [Paragraph('HRA', cell_l), Paragraph(fmt(payslip.hra), cell_r)],
        [Paragraph('Allowances', cell_l), Paragraph(fmt(payslip.allowances), cell_r)],
        [Paragraph('Bonus', cell_l), Paragraph(fmt(payslip.bonus), cell_r)],
        [Paragraph('Total Earnings', cell_lb), Paragraph(fmt(total_earnings), cell_rb)],
    ]
    e_tbl = Table(earn_rows, colWidths=[half_w * 0.6, half_w * 0.4])
    e_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), GREEN),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#ecfdf5')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -2), [WHITE, LIGHT_G]),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
    ]))

    # Deductions table
    deduc_rows = [
        [Paragraph('DEDUCTIONS', hdr_d), Paragraph('AMOUNT', hdr_d)],
        [Paragraph('Deductions', cell_l), Paragraph(fmt(payslip.deductions), cell_r)],
        [Paragraph('Tax', cell_l), Paragraph(fmt(payslip.tax), cell_r)],
        [Paragraph('Total Deductions', cell_lb), Paragraph(fmt(total_deductions), cell_rb)],
    ]
    d_tbl = Table(deduc_rows, colWidths=[half_w * 0.6, half_w * 0.4])
    d_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), RED),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#fef2f2')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -2), [WHITE, LIGHT_G]),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
    ]))

    # Side-by-side layout
    side_tbl = Table([[e_tbl, d_tbl]], colWidths=[page_w * 0.5, page_w * 0.5])
    side_tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (0, 0), 0),
        ('RIGHTPADDING', (1, 0), (1, 0), 0),
        ('LEFTPADDING', (1, 0), (1, 0), 6),
    ]))
    elements.append(side_tbl)
    elements.append(Spacer(1, 0.6*cm))

    # ── Net Salary Box ─────────────────────────────────────────────────────
    net_label = ParagraphStyle('nl', fontSize=14, fontName='Helvetica-Bold', textColor=WHITE)
    net_value = ParagraphStyle('nv', fontSize=16, fontName='Helvetica-Bold', textColor=WHITE, alignment=2)

    net_data = [[Paragraph('NET SALARY', net_label), Paragraph(fmt(payslip.net_salary), net_value)]]
    net_tbl = Table(net_data, colWidths=[page_w * 0.5, page_w * 0.5])
    net_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), PRIMARY),
        ('TOPPADDING', (0, 0), (-1, -1), 14),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 14),
        ('LEFTPADDING', (0, 0), (-1, -1), 16),
        ('RIGHTPADDING', (0, 0), (-1, -1), 16),
        ('ROUNDEDCORNERS', [6]),
    ]))
    elements.append(net_tbl)
    elements.append(Spacer(1, 0.6*cm))

    # ── Payment Details ────────────────────────────────────────────────────
    pay_date_str = payment.payment_date.strftime('%d %b %Y') if payment.payment_date else '—'
    pay_lbl = ParagraphStyle('plbl', fontSize=7, fontName='Helvetica', textColor=GREY, leading=9)
    pay_val = ParagraphStyle('pval', fontSize=8.5, fontName='Helvetica-Bold', textColor=DARK, leading=12)

    pay_info = [
        [Paragraph('Payment Date', pay_lbl), Paragraph('Payment Method', pay_lbl),
         Paragraph('Payment Status', pay_lbl), Paragraph('Pay Period', pay_lbl)],
        [Paragraph(pay_date_str, pay_val), Paragraph(payment.get_payment_method_display(), pay_val),
         Paragraph(payment.get_payment_status_display(), pay_val), Paragraph(f'{month_name} {payment.year}', pay_val)],
    ]
    pay_tbl = Table(pay_info, colWidths=[page_w * 0.25] * 4)
    pay_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), LIGHT_G),
        ('TOPPADDING', (0, 0), (-1, 0), 6),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 1),
        ('TOPPADDING', (0, 1), (-1, 1), 1),
        ('BOTTOMPADDING', (0, 1), (-1, 1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('ROUNDEDCORNERS', [4]),
    ]))
    elements.append(pay_tbl)
    elements.append(Spacer(1, 0.8*cm))

    # ── Footer ─────────────────────────────────────────────────────────────
    elements.append(HRFlowable(width='100%', thickness=0.5, color=BORDER))
    elements.append(Spacer(1, 0.3*cm))
    footer = ParagraphStyle('ft', fontSize=7, fontName='Helvetica', textColor=GREY, alignment=1)
    elements.append(Paragraph(
        'This is a system-generated payslip and does not require a signature.',
        footer,
    ))
    elements.append(Spacer(1, 0.15*cm))
    elements.append(Paragraph(
        f'Generated on {timezone.localtime(timezone.now()).strftime("%d %b %Y, %I:%M %p")} '
        f'by PromoPe HR System',
        footer,
    ))
    elements.append(Spacer(1, 0.15*cm))
    elements.append(Paragraph(
        'PromoPe &bull; Embassy Galaxy, Sector 62, Noida 201309, Uttar Pradesh, India',
        footer,
    ))

    doc.build(elements)
    buffer.seek(0)

    filename = f'PromoPe_Payslip_{emp.employee_id}_{month_name}_{payment.year}.pdf'
    response = HttpResponse(buffer.read(), content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


# ══════════════════════════════════════════════════════════════════════════════
# HIRING MODULE VIEWS
# ══════════════════════════════════════════════════════════════════════════════

@api_view(['GET'])
@permission_classes([IsHROrAbove])
def hiring_dashboard(request):
    """Aggregated stats for the hiring dashboard."""
    today       = date.today()
    month_start = today.replace(day=1)

    all_candidates = Candidate.objects.all()
    total          = all_candidates.count()
    rejected_count = all_candidates.filter(current_stage='rejected').count()

    # Stage distribution
    stage_distribution = {}
    for val, _ in Candidate.Stage.choices:
        stage_distribution[val] = all_candidates.filter(current_stage=val).count()

    # Applications per job (top 10)
    apps_per_job = list(
        JobPosition.objects
        .annotate(count=Count('candidates'))
        .values('job_title', 'count')
        .order_by('-count')[:10]
    )

    # 6-month hiring trend
    trend = []
    for i in range(5, -1, -1):
        ref      = today.replace(day=1)
        # subtract i months
        month    = ref.month - i
        year     = ref.year
        while month <= 0:
            month += 12
            year  -= 1
        m_start  = date(year, month, 1)
        next_m   = month + 1 if month < 12 else 1
        next_y   = year if month < 12 else year + 1
        m_end    = date(next_y, next_m, 1)
        hired    = all_candidates.filter(current_stage='hired',
                                         created_at__gte=m_start,
                                         created_at__lt=m_end).count()
        applied  = all_candidates.filter(created_at__gte=m_start,
                                          created_at__lt=m_end).count()
        trend.append({
            'month':   m_start.strftime('%b %Y'),
            'hired':   hired,
            'applied': applied,
        })

    return Response({
        'open_positions':    JobPosition.objects.filter(job_status=JobPosition.Status.OPEN).count(),
        'total_applicants':  total,
        'hires_this_month':  all_candidates.filter(current_stage='hired',
                                                    created_at__gte=month_start).count(),
        'rejection_rate':    round(rejected_count / total * 100, 1) if total > 0 else 0,
        'stage_distribution': stage_distribution,
        'applications_per_job': apps_per_job,
        'hiring_trend':      trend,
    })


@api_view(['GET'])
@permission_classes([IsHROrAbove])
def hiring_pipeline_view(request):
    """Return candidates grouped by stage — powers the Kanban board."""
    position_id = request.query_params.get('position')
    qs = Candidate.objects.select_related('applied_position')
    if position_id:
        qs = qs.filter(applied_position_id=position_id)
    pipeline = {}
    for val, _ in Candidate.Stage.choices:
        pipeline[val] = CandidateListSerializer(
            qs.filter(current_stage=val),
            many=True,
            context={'request': request},
        ).data
    return Response(pipeline)


# ── Job Positions ──────────────────────────────────────────────────────────────

class JobPositionListCreate(generics.ListCreateAPIView):
    serializer_class   = JobPositionSerializer
    permission_classes = [IsHROrAbove]

    def get_queryset(self):
        qs     = JobPosition.objects.select_related('department', 'created_by')
        params = self.request.query_params
        if params.get('status'):
            qs = qs.filter(job_status=params['status'])
        if params.get('department'):
            qs = qs.filter(department_id=params['department'])
        if params.get('employment_type'):
            qs = qs.filter(employment_type=params['employment_type'])
        return qs

    def perform_create(self, serializer):
        job = serializer.save(created_by=self.request.user)
        log_activity(
            self.request.user, 'job_posted',
            f'Posted job: {job.job_title}',
            target_type='JobPosition', target_id=job.id, target_name=job.job_title,
        )


class JobPositionDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset           = JobPosition.objects.select_related('department', 'created_by')
    serializer_class   = JobPositionSerializer
    permission_classes = [IsHROrAbove]


# ── Candidates ────────────────────────────────────────────────────────────────

class CandidateListCreate(generics.ListCreateAPIView):
    permission_classes = [IsHROrAbove]

    def get_serializer_class(self):
        return CandidateListSerializer

    def get_queryset(self):
        qs     = Candidate.objects.select_related('applied_position', 'added_by')
        params = self.request.query_params
        if params.get('stage'):
            qs = qs.filter(current_stage=params['stage'])
        if params.get('position'):
            qs = qs.filter(applied_position_id=params['position'])
        if params.get('search'):
            s  = params['search']
            qs = qs.filter(
                Q(candidate_name__icontains=s) | Q(email__icontains=s)
            )
        return qs

    def perform_create(self, serializer):
        from apps.authentication.models import User as AuthUser
        c = serializer.save(added_by=self.request.user)
        log_activity(
            self.request.user, 'candidate_added',
            f'Added candidate: {c.candidate_name}',
            target_type='Candidate', target_id=c.id, target_name=c.candidate_name,
        )
        pos_name = c.applied_position.job_title if c.applied_position else 'a position'
        for u in AuthUser.objects.filter(role__in=[AuthUser.Role.FOUNDER, AuthUser.Role.ADMIN, AuthUser.Role.HR]):
            create_notification(
                u, 'New Candidate',
                f'{c.candidate_name} applied for {pos_name}',
                type='system',
                link=f'/hr/hiring/candidates/{c.id}',
            )


class CandidateDetail(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsHROrAbove]

    def get_serializer_class(self):
        return CandidateDetailSerializer

    def get_queryset(self):
        return Candidate.objects.select_related(
            'applied_position', 'added_by'
        ).prefetch_related('interviews', 'evaluations', 'documents')

    def perform_update(self, serializer):
        from apps.authentication.models import User as AuthUser
        old_stage = self.get_object().current_stage
        candidate = serializer.save()
        new_stage = candidate.current_stage
        if old_stage != new_stage:
            log_activity(
                self.request.user, 'stage_changed',
                f'{candidate.candidate_name}: {old_stage} → {new_stage}',
                target_type='Candidate', target_id=candidate.id,
                target_name=candidate.candidate_name,
            )
            if new_stage == 'hired':
                for u in AuthUser.objects.filter(role__in=[AuthUser.Role.FOUNDER, AuthUser.Role.ADMIN, AuthUser.Role.HR]):
                    create_notification(
                        u, 'Candidate Hired!',
                        f'{candidate.candidate_name} has been hired',
                        type='system', priority='high',
                        link=f'/hr/hiring/candidates/{candidate.id}',
                    )


@api_view(['POST'])
@permission_classes([IsHROrAbove])
def update_candidate_stage(request, pk):
    """PATCH a candidate's stage only — used by the Kanban drag-and-drop."""
    candidate  = get_object_or_404(Candidate, pk=pk)
    stage      = request.data.get('stage')
    valid      = [v for v, _ in Candidate.Stage.choices]
    if stage not in valid:
        return Response({'error': f'Invalid stage. Choose from: {valid}'}, status=400)
    old_stage              = candidate.current_stage
    candidate.current_stage = stage
    candidate.save(update_fields=['current_stage', 'updated_at'])
    log_activity(
        request.user, 'stage_changed',
        f'{candidate.candidate_name}: {old_stage} → {stage}',
        target_type='Candidate', target_id=candidate.id,
        target_name=candidate.candidate_name,
    )
    if stage == 'hired':
        from apps.authentication.models import User as AuthUser
        for u in AuthUser.objects.filter(role__in=[AuthUser.Role.FOUNDER, AuthUser.Role.ADMIN, AuthUser.Role.HR]):
            create_notification(
                u, 'Candidate Hired!',
                f'{candidate.candidate_name} has been hired',
                type='system', priority='high',
                link=f'/hr/hiring/candidates/{candidate.id}',
            )
    return Response(CandidateListSerializer(candidate, context={'request': request}).data)


@api_view(['POST'])
@permission_classes([IsHROrAbove])
def convert_to_employee(request, pk):
    """Convert a hired candidate into a User + Employee record."""
    from apps.authentication.models import User as AuthUser
    from apps.employees.models import Employee as EmployeeModel

    candidate = get_object_or_404(Candidate, pk=pk)
    if candidate.converted_to_employee:
        return Response({'error': 'Candidate has already been converted to an employee.'}, status=400)
    if candidate.current_stage != 'hired':
        return Response({'error': 'Only hired candidates can be converted.'}, status=400)

    data     = request.data
    email    = data.get('email', candidate.email)
    password = data.get('password') or AuthUser.objects.make_random_password()

    # CV3: validate role against User.Role choices
    role = data.get('role', 'employee')
    valid_roles = [r.value for r in AuthUser.Role]
    if role not in valid_roles:
        return Response({'error': f'Invalid role. Choose from: {valid_roles}'}, status=400)

    if AuthUser.objects.filter(email=email).exists():
        return Response({'error': f'A user with email {email} already exists.'}, status=400)

    # CV1: wrap in transaction so User is rolled back if Employee creation fails
    with transaction.atomic():
        user = AuthUser.objects.create_user(
            email     = email,
            full_name = candidate.candidate_name,
            password  = password,
            role      = role,
        )
        dept = Department.objects.filter(id=data.get('department')).first() if data.get('department') else None

        employee = EmployeeModel.objects.create(
            user         = user,
            full_name    = candidate.candidate_name,
            email        = email,
            phone        = candidate.phone or '',
            department   = dept,
            role         = data.get('job_role') or (
                candidate.applied_position.job_title if candidate.applied_position else 'Employee'
            ),
            joining_date = data.get('joining_date') or date.today(),
            salary       = data.get('salary', 0),
            status       = 'active',
        )

        # CV2: create SalaryStructure so payroll module can generate payslips
        SalaryStructure.objects.create(
            employee       = employee,
            base_salary    = Decimal(str(data.get('salary', 0))),
            effective_from = data.get('joining_date') or date.today(),
            created_by     = request.user,
        )

        candidate.converted_to_employee = True
        candidate.save(update_fields=['converted_to_employee'])

    log_activity(
        request.user, 'candidate_hired',
        f'{candidate.candidate_name} converted to employee {employee.employee_id}',
        target_type='Candidate', target_id=candidate.id,
        target_name=candidate.candidate_name,
    )
    # CV4: notify HR/admin/founder users about the conversion
    for u in AuthUser.objects.filter(role__in=[AuthUser.Role.FOUNDER, AuthUser.Role.ADMIN, AuthUser.Role.HR]):
        create_notification(
            u, 'Candidate Converted to Employee',
            f'{candidate.candidate_name} is now employee {employee.employee_id}',
            type='system', priority='normal',
            link=f'/hr/hiring/candidates/{candidate.id}',
        )
    return Response({'employee_id': employee.employee_id, 'user_id': user.id}, status=status.HTTP_201_CREATED)


# ── Interviews ────────────────────────────────────────────────────────────────

class InterviewListCreate(generics.ListCreateAPIView):
    serializer_class   = InterviewSerializer
    permission_classes = [IsManagerOrAbove]

    def get_queryset(self):
        qs = Interview.objects.select_related('candidate', 'interviewer', 'scheduled_by')
        if self.request.query_params.get('candidate'):
            qs = qs.filter(candidate_id=self.request.query_params['candidate'])
        if self.request.query_params.get('interviewer'):
            qs = qs.filter(interviewer_id=self.request.query_params['interviewer'])
        return qs

    def perform_create(self, serializer):
        interview = serializer.save(scheduled_by=self.request.user)
        c         = interview.candidate
        log_activity(
            self.request.user, 'interview_scheduled',
            f'Interview scheduled for {c.candidate_name} on {interview.interview_date}',
            target_type='Candidate', target_id=c.id, target_name=c.candidate_name,
        )
        if interview.interviewer:
            create_notification(
                interview.interviewer,
                'Interview Scheduled',
                f'You have an interview with {c.candidate_name} on {interview.interview_date} at {interview.interview_time}',
                type='system',
                link='/hr/hiring/interviews',
            )


class InterviewDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset           = Interview.objects.select_related('candidate', 'interviewer')
    serializer_class   = InterviewSerializer
    permission_classes = [IsManagerOrAbove]


# ── Evaluations ───────────────────────────────────────────────────────────────

class EvaluationListCreate(generics.ListCreateAPIView):
    serializer_class   = CandidateEvaluationSerializer
    permission_classes = [IsManagerOrAbove]

    def get_queryset(self):
        qs = CandidateEvaluation.objects.select_related('candidate', 'interviewer')
        if self.request.query_params.get('candidate'):
            qs = qs.filter(candidate_id=self.request.query_params['candidate'])
        return qs

    def perform_create(self, serializer):
        serializer.save(interviewer=self.request.user)


class EvaluationDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset           = CandidateEvaluation.objects.select_related('candidate', 'interviewer')
    serializer_class   = CandidateEvaluationSerializer
    permission_classes = [IsManagerOrAbove]


# ── Candidate Documents ───────────────────────────────────────────────────────

class CandidateDocumentListCreate(generics.ListCreateAPIView):
    serializer_class   = CandidateDocumentSerializer
    permission_classes = [IsHROrAbove]

    def get_queryset(self):
        qs = CandidateDocument.objects.select_related('candidate', 'uploaded_by')
        if self.request.query_params.get('candidate'):
            qs = qs.filter(candidate_id=self.request.query_params['candidate'])
        return qs

    def perform_create(self, serializer):
        serializer.save(uploaded_by=self.request.user)


class CandidateDocumentDetail(generics.RetrieveDestroyAPIView):
    queryset           = CandidateDocument.objects.select_related('candidate', 'uploaded_by')
    serializer_class   = CandidateDocumentSerializer
    permission_classes = [IsHROrAbove]


# ── HR Task Assignment ─────────────────────────────────────────────────────────

class HRTaskListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/hr/tasks/          — List all tasks with optional filters
    POST /api/hr/tasks/          — Create and assign a task (HR/Admin only)
    Query params: status, priority, department, employee, overdue=true
    """
    permission_classes = [IsHROrAbove]

    def get_serializer_class(self):
        return TaskCreateSerializer if self.request.method == 'POST' else TaskListSerializer

    def get_queryset(self):
        qs = Task.objects.select_related('assigned_to', 'department', 'assigned_by') \
                         .prefetch_related('comments')
        p = self.request.query_params
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        if p.get('priority'):
            qs = qs.filter(priority=p['priority'])
        if p.get('department'):
            qs = qs.filter(department_id=p['department'])
        if p.get('employee'):
            qs = qs.filter(assigned_to_id=p['employee'])
        if p.get('overdue') == 'true':
            qs = qs.filter(deadline__lt=date.today(), status__in=['pending', 'in_progress'])
        if p.get('search'):
            qs = qs.filter(name__icontains=p['search'])
        return qs.order_by('-created_at')

    def perform_create(self, serializer):
        task = serializer.save()
        # Notify the assigned employee
        if task.assigned_to and task.assigned_to.user:
            create_notification(
                recipient=task.assigned_to.user,
                title='New Task Assigned',
                message=f'HR has assigned you a new task: {task.name}',
                type='task_assigned',
                priority='high',
                link='/tasks',
                target_type='task',
                target_id=task.id,
            )
        # Log to activity feed
        assignee = task.assigned_to.full_name if task.assigned_to else 'unassigned'
        log_activity(
            actor=self.request.user,
            verb='task_assigned',
            description=f'HR assigned task "{task.name}" to {assignee}',
            target_type='task',
            target_id=task.id,
            target_name=task.name,
            ip_address=get_client_ip(self.request),
        )


class HRTaskDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/hr/tasks/{id}/   — Full task detail
    PATCH  /api/hr/tasks/{id}/   — Update task fields
    DELETE /api/hr/tasks/{id}/   — Delete task
    """
    permission_classes = [IsHROrAbove]
    queryset = Task.objects.select_related('assigned_to', 'department', 'assigned_by') \
                           .prefetch_related('comments', 'attachments', 'history')

    def get_serializer_class(self):
        return TaskDetailSerializer if self.request.method == 'GET' else TaskCreateSerializer

    def perform_update(self, serializer):
        task = serializer.save()
        log_activity(
            actor=self.request.user,
            verb='task_updated',
            description=f'HR updated task "{task.name}"',
            target_type='task',
            target_id=task.id,
            target_name=task.name,
            ip_address=get_client_ip(self.request),
        )


@api_view(['GET'])
@permission_classes([IsHROrAbove])
def hr_task_stats(request):
    """
    GET /api/hr/tasks/stats/
    Returns aggregate counts used by the HR Task Management dashboard.
    """
    today = date.today()
    qs = Task.objects.all()
    return Response({
        'total':          qs.count(),
        'assigned_today': qs.filter(created_at__date=today).count(),
        'overdue':        qs.filter(deadline__lt=today, status__in=['pending', 'in_progress']).count(),
        'completed':      qs.filter(status='completed').count(),
        'in_progress':    qs.filter(status='in_progress').count(),
        'pending':        qs.filter(status='pending').count(),
    })
