from django.utils import timezone
from django.db.models import Sum, Count, Q
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response

from apps.activity.utils import log_activity
from apps.notifications.utils import create_notification
from apps.authentication.models import User
from apps.employees.models import Employee

from .models import DailyReport, DailyReportAttachment
from .serializers import (
    DailyReportListSerializer,
    DailyReportDetailSerializer,
    DailyReportCreateSerializer,
    DailyReportUpdateSerializer,
    DailyReportReviewSerializer,
)


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _notify_hr_and_founders(employee, report):
    """Send in-app notification to every HR and Founder user."""
    recipients = User.objects.filter(
        role__in=[User.Role.HR, User.Role.FOUNDER, User.Role.ADMIN],
        is_active=True,
    )
    for recipient in recipients:
        create_notification(
            recipient=recipient,
            title='Daily Report Submitted',
            message=f'{employee.full_name} has submitted their daily report for {report.report_date}.',
            type='system',
            priority='normal',
            target_type='daily_report',
            target_id=report.id,
            link='/daily-report',
        )


# ──────────────────────────────────────────────────────────────────────────────
# List + Create
# ──────────────────────────────────────────────────────────────────────────────

class DailyReportListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/daily-reports/   — Employee sees own; HR/Founder sees all
    POST /api/daily-reports/   — Employee creates today's report
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return DailyReportCreateSerializer
        return DailyReportListSerializer

    def get_queryset(self):
        user = self.request.user
        qs = DailyReport.objects.select_related(
            'employee', 'employee__department', 'reviewed_by'
        )
        if not user.is_manager_or_above:
            try:
                qs = qs.filter(employee=user.employee_profile)
            except Exception:
                return DailyReport.objects.none()

        # Optional filters
        params = self.request.query_params
        if params.get('employee'):
            qs = qs.filter(employee_id=params['employee'])
        if params.get('department'):
            qs = qs.filter(employee__department_id=params['department'])
        if params.get('date'):
            qs = qs.filter(report_date=params['date'])
        if params.get('status'):
            qs = qs.filter(status=params['status'])

        return qs

    def perform_create(self, serializer):
        report = serializer.save()
        # Handle multiple file attachments
        for f in self.request.FILES.getlist('attachments'):
            DailyReportAttachment.objects.create(report=report, file=f, filename=f.name)
        log_activity(
            actor=self.request.user,
            verb='daily_report_submitted',
            description=f'{self.request.user.full_name} created daily report for {report.report_date}',
            target_type='daily_report',
            target_id=report.id,
            target_name=str(report),
        )


# ──────────────────────────────────────────────────────────────────────────────
# My Reports (employee-facing history)
# ──────────────────────────────────────────────────────────────────────────────

class MyReportsView(generics.ListAPIView):
    """GET /api/daily-reports/my-reports/  — own reports, newest first."""
    serializer_class = DailyReportListSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        try:
            employee = user.employee_profile
        except Exception:
            return DailyReport.objects.none()

        qs = DailyReport.objects.filter(employee=employee).select_related(
            'employee', 'employee__department', 'reviewed_by'
        )
        params = self.request.query_params
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        return qs


# ──────────────────────────────────────────────────────────────────────────────
# All Reports (HR / Founder only)
# ──────────────────────────────────────────────────────────────────────────────

class AllReportsView(generics.ListAPIView):
    """GET /api/daily-reports/all/  — HR/Founder with full filter support."""
    serializer_class = DailyReportListSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not user.is_manager_or_above:
            return DailyReport.objects.none()

        qs = DailyReport.objects.select_related(
            'employee', 'employee__department', 'reviewed_by'
        )
        params = self.request.query_params
        if params.get('employee'):
            qs = qs.filter(employee_id=params['employee'])
        if params.get('department'):
            qs = qs.filter(employee__department_id=params['department'])
        if params.get('date'):
            qs = qs.filter(report_date=params['date'])
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        if params.get('date_from'):
            qs = qs.filter(report_date__gte=params['date_from'])
        if params.get('date_to'):
            qs = qs.filter(report_date__lte=params['date_to'])

        return qs


# ──────────────────────────────────────────────────────────────────────────────
# Detail (retrieve + edit)
# ──────────────────────────────────────────────────────────────────────────────

class DailyReportDetailView(generics.RetrieveUpdateAPIView):
    """
    GET   /api/daily-reports/<pk>/  — owner or HR/Founder
    PATCH /api/daily-reports/<pk>/  — owner only, today + pending
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH'):
            return DailyReportUpdateSerializer
        return DailyReportDetailSerializer

    def get_queryset(self):
        return DailyReport.objects.select_related(
            'employee', 'employee__department', 'reviewed_by'
        )

    def get_object(self):
        obj = super().get_object()
        user = self.request.user

        # Read access: owner or HR/Founder
        is_owner = (obj.employee.user_id == user.id)
        if not is_owner and not user.is_manager_or_above:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You do not have permission to view this report.')
        return obj

    def update(self, request, *args, **kwargs):
        report = self.get_object()
        user = request.user

        # Only the report owner can edit
        if report.employee.user_id != user.id:
            return Response({'detail': 'Only the report owner can edit this report.'},
                            status=status.HTTP_403_FORBIDDEN)

        # Can only edit pending same-day reports
        if not report.is_editable:
            return Response(
                {'detail': 'Reports can only be edited on the same day they were created and while status is Pending.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        response = super().update(request, *args, **kwargs)
        # Handle multiple file attachments on update
        for f in request.FILES.getlist('attachments'):
            DailyReportAttachment.objects.create(report=report, file=f, filename=f.name)
        return response


# ──────────────────────────────────────────────────────────────────────────────
# Submit (PENDING → SUBMITTED)
# ──────────────────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def submit_report(request, pk):
    """POST /api/daily-reports/<pk>/submit/  — employee submits their report."""
    try:
        report = DailyReport.objects.select_related('employee').get(pk=pk)
    except DailyReport.DoesNotExist:
        return Response({'detail': 'Report not found.'}, status=status.HTTP_404_NOT_FOUND)

    if report.employee.user_id != request.user.id:
        return Response({'detail': 'You can only submit your own report.'},
                        status=status.HTTP_403_FORBIDDEN)

    if report.status == DailyReport.Status.SUBMITTED:
        return Response({'detail': 'Report is already submitted.'}, status=status.HTTP_400_BAD_REQUEST)

    if report.status == DailyReport.Status.REVIEWED:
        return Response({'detail': 'Reviewed reports cannot be resubmitted.'},
                        status=status.HTTP_400_BAD_REQUEST)

    report.status = DailyReport.Status.SUBMITTED
    report.save(update_fields=['status', 'updated_at'])

    # Activity log
    log_activity(
        actor=request.user,
        verb='daily_report_submitted',
        description=f'{request.user.full_name} submitted daily report for {report.report_date}',
        target_type='daily_report',
        target_id=report.id,
        target_name=str(report),
    )

    # Notify HR + Founders
    _notify_hr_and_founders(report.employee, report)

    serializer = DailyReportDetailSerializer(report, context={'request': request})
    return Response(serializer.data)


# ──────────────────────────────────────────────────────────────────────────────
# Review (SUBMITTED → REVIEWED)
# ──────────────────────────────────────────────────────────────────────────────

@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def review_report(request, pk):
    """PATCH /api/daily-reports/<pk>/review/  — HR/Founder marks report reviewed."""
    if not request.user.is_manager_or_above:
        return Response({'detail': 'Only HR or Founders can review reports.'},
                        status=status.HTTP_403_FORBIDDEN)

    try:
        report = DailyReport.objects.select_related('employee').get(pk=pk)
    except DailyReport.DoesNotExist:
        return Response({'detail': 'Report not found.'}, status=status.HTTP_404_NOT_FOUND)

    if report.status != DailyReport.Status.SUBMITTED:
        return Response({'detail': 'Only submitted reports can be reviewed.'},
                        status=status.HTTP_400_BAD_REQUEST)

    serializer = DailyReportReviewSerializer(report, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)

    report.status = DailyReport.Status.REVIEWED
    report.reviewed_by = request.user
    report.reviewed_at = timezone.now()
    report.review_note = serializer.validated_data.get('review_note', '')
    report.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'review_note', 'updated_at'])

    log_activity(
        actor=request.user,
        verb='daily_report_reviewed',
        description=f'{request.user.full_name} reviewed daily report of {report.employee.full_name} for {report.report_date}',
        target_type='daily_report',
        target_id=report.id,
        target_name=str(report),
    )

    serializer = DailyReportDetailSerializer(report, context={'request': request})
    return Response(serializer.data)


# ──────────────────────────────────────────────────────────────────────────────
# Analytics
# ──────────────────────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def daily_report_analytics(request):
    """GET /api/daily-reports/analytics/  — dashboard stats for HR/Founder."""
    if not request.user.is_manager_or_above:
        return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

    today = timezone.now().date()
    active_employees = Employee.objects.filter(status='active')
    total_active = active_employees.count()

    today_reports = DailyReport.objects.filter(report_date=today)
    submitted_today = today_reports.filter(
        status__in=[DailyReport.Status.SUBMITTED, DailyReport.Status.REVIEWED]
    ).count()
    pending_today = today_reports.filter(status=DailyReport.Status.PENDING).count()
    total_hours_today = today_reports.aggregate(
        total=Sum('hours_worked')
    )['total'] or 0

    # Employees who haven't submitted at all today
    submitted_employee_ids = today_reports.filter(
        status__in=[DailyReport.Status.SUBMITTED, DailyReport.Status.REVIEWED]
    ).values_list('employee_id', flat=True)
    not_submitted_count = total_active - submitted_today
    not_submitted_employees = active_employees.exclude(
        id__in=submitted_employee_ids
    ).select_related('department').values(
        'id', 'full_name', 'employee_id',
        'department__name',
    )[:20]  # cap at 20 for UI

    # Hours per day for the last 14 days
    from datetime import timedelta
    start_date = today - timedelta(days=13)
    hours_per_day_qs = (
        DailyReport.objects
        .filter(report_date__gte=start_date, report_date__lte=today)
        .values('report_date')
        .annotate(total_hours=Sum('hours_worked'))
        .order_by('report_date')
    )
    hours_per_day = [
        {'date': str(row['report_date']), 'total_hours': float(row['total_hours'] or 0)}
        for row in hours_per_day_qs
    ]

    return Response({
        'submitted_today': submitted_today,
        'pending_today': pending_today,
        'not_submitted_today': max(not_submitted_count, 0),
        'total_hours_today': float(total_hours_today),
        'not_submitted_employees': list(not_submitted_employees),
        'hours_per_day': hours_per_day,
    })


# ──────────────────────────────────────────────────────────────────────────────
# Attachment Delete
# ──────────────────────────────────────────────────────────────────────────────

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_attachment(request, pk):
    """DELETE /api/daily-reports/attachments/<pk>/  — remove a single attachment."""
    try:
        att = DailyReportAttachment.objects.select_related('report__employee').get(pk=pk)
    except DailyReportAttachment.DoesNotExist:
        return Response({'detail': 'Attachment not found.'}, status=status.HTTP_404_NOT_FOUND)

    # Only the report owner or manager+ can delete
    is_owner = att.report.employee.user_id == request.user.id
    if not is_owner and not request.user.is_manager_or_above:
        return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

    att.file.delete(save=False)
    att.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
