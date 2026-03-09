from django.utils import timezone
from rest_framework import serializers
from .models import AttendanceLog, UserPresence


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
            'total_work_hours', 'ip_address', 'status', 'notes',
        ]
        read_only_fields = ['total_work_hours']

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
