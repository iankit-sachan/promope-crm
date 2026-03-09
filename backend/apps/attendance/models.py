"""
Attendance & Presence models.

AttendanceLog  — one record per employee per calendar day.
UserPresence   — one record per user, updated in real-time.
"""

import datetime
from django.conf import settings
from django.db import models
from django.utils import timezone


class AttendanceLog(models.Model):
    """Daily attendance record for an employee."""

    class Status(models.TextChoices):
        PRESENT  = 'present',  'Present'
        LATE     = 'late',     'Late'
        HALF_DAY = 'half_day', 'Half Day'
        ABSENT   = 'absent',   'Absent'

    # 09:30 AM is considered the late-login threshold
    LATE_HOUR   = 9
    LATE_MINUTE = 30

    employee         = models.ForeignKey(
        'employees.Employee',
        on_delete=models.CASCADE,
        related_name='attendance_logs',
    )
    date             = models.DateField(default=datetime.date.today)
    login_time       = models.DateTimeField(null=True, blank=True)
    logout_time      = models.DateTimeField(null=True, blank=True)
    total_work_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    ip_address       = models.GenericIPAddressField(null=True, blank=True)
    status           = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PRESENT
    )
    notes            = models.TextField(blank=True)

    class Meta:
        unique_together = [['employee', 'date']]
        ordering = ['-date', '-login_time']

    def __str__(self):
        return f"{self.employee.full_name} — {self.date} ({self.status})"

    def auto_set_status(self):
        """Set present/late based on login_time vs 09:30 threshold."""
        if self.login_time:
            local_dt = timezone.localtime(self.login_time)
            threshold = local_dt.replace(
                hour=self.LATE_HOUR, minute=self.LATE_MINUTE,
                second=0, microsecond=0,
            )
            self.status = (
                self.Status.LATE if local_dt > threshold else self.Status.PRESENT
            )

    def calculate_work_hours(self):
        """Compute total_work_hours from login → logout delta."""
        if self.login_time and self.logout_time:
            delta = self.logout_time - self.login_time
            hours = round(delta.total_seconds() / 3600, 2)
            self.total_work_hours = max(hours, 0)
            # If less than 4h worked and not already late, mark as half-day
            if 0 < self.total_work_hours < 4 and self.status not in (
                self.Status.LATE, self.Status.ABSENT
            ):
                self.status = self.Status.HALF_DAY

    def save(self, *args, **kwargs):
        self.calculate_work_hours()
        super().save(*args, **kwargs)


class UserPresence(models.Model):
    """Real-time presence for every user (upserted on connect/disconnect)."""

    class Status(models.TextChoices):
        ONLINE  = 'online',  'Online'
        AWAY    = 'away',    'Away'
        IDLE    = 'idle',    'Idle'
        OFFLINE = 'offline', 'Offline'

    user          = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='presence',
    )
    status        = models.CharField(
        max_length=20, choices=Status.choices, default=Status.OFFLINE
    )
    last_active   = models.DateTimeField(default=timezone.now)
    session_start = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-last_active']

    def __str__(self):
        return f"{self.user.full_name} — {self.status}"

    @property
    def last_active_display(self):
        """Returns a human-readable 'X ago' string."""
        diff_s = int((timezone.now() - self.last_active).total_seconds())
        if diff_s < 60:
            return 'just now'
        if diff_s < 3600:
            return f'{diff_s // 60} min ago'
        if diff_s < 86400:
            return f'{diff_s // 3600} hr ago'
        return f'{diff_s // 86400} days ago'
