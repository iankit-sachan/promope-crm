from rest_framework import serializers
from django.utils import timezone
from .models import DailyReport
from apps.employees.models import Employee


class EmployeeBriefSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)

    class Meta:
        model = Employee
        fields = ['id', 'employee_id', 'full_name', 'profile_photo', 'department_name']


class DailyReportListSerializer(serializers.ModelSerializer):
    """Compact serializer for list views."""
    employee_name       = serializers.CharField(source='employee.full_name', read_only=True)
    employee_id_code    = serializers.CharField(source='employee.employee_id', read_only=True)
    department_name     = serializers.CharField(source='employee.department.name', read_only=True)
    reviewed_by_name    = serializers.CharField(source='reviewed_by.full_name', read_only=True)
    attachment_url      = serializers.SerializerMethodField()
    is_editable         = serializers.BooleanField(read_only=True)

    class Meta:
        model = DailyReport
        fields = [
            'id', 'employee', 'employee_name', 'employee_id_code', 'department_name',
            'report_date', 'tasks_assigned', 'tasks_completed', 'tasks_pending',
            'hours_worked', 'work_description', 'blockers',
            'status', 'reviewed_by_name', 'review_note', 'reviewed_at',
            'attachment_url', 'is_editable', 'created_at', 'updated_at',
        ]

    def get_attachment_url(self, obj):
        if not obj.attachment:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.attachment.url)
        return obj.attachment.url


class DailyReportDetailSerializer(serializers.ModelSerializer):
    """Full detail serializer with nested employee info."""
    employee_detail  = EmployeeBriefSerializer(source='employee', read_only=True)
    reviewed_by_name = serializers.CharField(source='reviewed_by.full_name', read_only=True)
    attachment_url   = serializers.SerializerMethodField()
    is_editable      = serializers.BooleanField(read_only=True)

    class Meta:
        model = DailyReport
        fields = [
            'id', 'employee', 'employee_detail',
            'report_date', 'tasks_assigned', 'tasks_completed', 'tasks_pending',
            'hours_worked', 'work_description', 'blockers', 'attachment', 'attachment_url',
            'status', 'reviewed_by', 'reviewed_by_name', 'review_note', 'reviewed_at',
            'is_editable', 'created_at', 'updated_at',
        ]
        read_only_fields = ['status', 'reviewed_by', 'reviewed_at', 'created_at', 'updated_at']

    def get_attachment_url(self, obj):
        if not obj.attachment:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.attachment.url)
        return obj.attachment.url


class DailyReportCreateSerializer(serializers.ModelSerializer):
    """For POST — employee is auto-set from request.user."""

    class Meta:
        model = DailyReport
        fields = [
            'id', 'report_date', 'tasks_assigned', 'tasks_completed', 'tasks_pending',
            'hours_worked', 'work_description', 'blockers', 'attachment', 'status',
        ]
        read_only_fields = ['id', 'status']

    def validate_report_date(self, value):
        today = timezone.now().date()
        if value != today:
            raise serializers.ValidationError('You can only create a report for today.')
        # Guard against duplicate report for the same employee+date
        request = self.context.get('request')
        if request and request.method == 'POST':
            try:
                employee = request.user.employee_profile
                if DailyReport.objects.filter(employee=employee, report_date=value).exists():
                    raise serializers.ValidationError(
                        'You have already submitted a report for today. Edit the existing one.'
                    )
            except Exception as exc:
                if isinstance(exc, serializers.ValidationError):
                    raise
        return value

    def validate_hours_worked(self, value):
        if value < 0 or value > 24:
            raise serializers.ValidationError('Hours worked must be between 0 and 24.')
        return value

    def create(self, validated_data):
        request = self.context['request']
        employee = request.user.employee_profile
        return DailyReport.objects.create(employee=employee, **validated_data)


class DailyReportUpdateSerializer(serializers.ModelSerializer):
    """For PATCH — same-day pending report edits only."""

    class Meta:
        model = DailyReport
        fields = [
            'id', 'tasks_assigned', 'tasks_completed', 'tasks_pending',
            'hours_worked', 'work_description', 'blockers', 'attachment',
        ]
        read_only_fields = ['id']

    def validate_hours_worked(self, value):
        if value < 0 or value > 24:
            raise serializers.ValidationError('Hours worked must be between 0 and 24.')
        return value


class DailyReportReviewSerializer(serializers.ModelSerializer):
    """For PATCH /review/ — HR/Founder marks report reviewed."""

    class Meta:
        model = DailyReport
        fields = ['review_note']
