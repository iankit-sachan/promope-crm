from django.utils import timezone
from rest_framework import serializers
from .models import AttendanceLog, UserPresence, AttendanceRegularization, AttendanceStreak


class AttendanceLogSerializer(serializers.ModelSerializer):
    employee_name   = serializers.CharField(source='employee.full_name',           read_only=True)
    employee_code   = serializers.CharField(source='employee.employee_id',         read_only=True)
    department      = serializers.SerializerMethodField()
    profile_photo   = serializers.SerializerMethodField()
    login_time_str  = serializers.SerializerMethodField()
    logout_time_str = serializers.SerializerMethodField()

    class Meta:
        model  = AttendanceLog
        fields = [
            'id', 'employee', 'employee_name', 'employee_code', 'department',
            'profile_photo', 'date',
            'login_time', 'logout_time', 'login_time_str', 'logout_time_str',
            'total_work_hours', 'overtime_hours', 'ip_address', 'status', 'notes',
            'is_regularized',
        ]
        read_only_fields = ['total_work_hours', 'overtime_hours', 'is_regularized']

    def get_department(self, obj):
        return obj.employee.department.name if obj.employee.department else None

    def get_profile_photo(self, obj):
        return obj.employee.profile_photo.url if obj.employee.profile_photo else None

    @staticmethod
    def _fmt(dt):
        return timezone.localtime(dt).strftime('%I:%M %p') if dt else None

    def get_login_time_str(self, obj):
        return self._fmt(obj.login_time)

    def get_logout_time_str(self, obj):
        return self._fmt(obj.logout_time)


class UserPresenceSerializer(serializers.ModelSerializer):
    user_id             = serializers.IntegerField(source='user.id',        read_only=True)
    full_name           = serializers.CharField(source='user.full_name',    read_only=True)
    role                = serializers.CharField(source='user.role',         read_only=True)
    last_active_display = serializers.CharField(read_only=True)

    class Meta:
        model  = UserPresence
        fields = [
            'id', 'user_id', 'full_name', 'role',
            'status', 'last_active', 'last_active_display',
        ]


class AttendanceRegularizationSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    employee_code = serializers.CharField(source='employee.employee_id', read_only=True)
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = AttendanceRegularization
        fields = [
            'id', 'employee', 'employee_name', 'employee_code',
            'date', 'req_type', 'reason',
            'requested_login_time', 'requested_logout_time',
            'status', 'reviewed_by', 'reviewed_by_name',
            'reviewed_at', 'review_note', 'created_at',
        ]
        read_only_fields = ['employee', 'status', 'reviewed_by', 'reviewed_at']

    def get_reviewed_by_name(self, obj):
        return obj.reviewed_by.get_full_name() if obj.reviewed_by else None


class AttendanceStreakSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    employee_code = serializers.CharField(source='employee.employee_id', read_only=True)
    profile_photo = serializers.SerializerMethodField()
    punctuality_score = serializers.SerializerMethodField()

    class Meta:
        model  = AttendanceStreak
        fields = [
            'employee', 'employee_name', 'employee_code', 'profile_photo',
            'current_streak', 'longest_streak',
            'total_on_time', 'total_late', 'last_updated',
            'punctuality_score',
        ]

    def get_profile_photo(self, obj):
        return obj.employee.profile_photo.url if obj.employee.profile_photo else None

    def get_punctuality_score(self, obj):
        total = obj.total_on_time + obj.total_late
        if total == 0:
            return 100
        return round(obj.total_on_time / total * 100, 1)
