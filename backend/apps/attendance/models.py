"""
Attendance & Presence models.

AttendanceLog          — one record per employee per calendar day.
UserPresence           — one record per user, updated in real-time.
AttendanceRegularization — employee correction requests.
AttendanceStreak       — gamification: per-employee on-time streaks.
"""

import datetime
from django.conf import settings
from django.db import models
from django.utils import timezone


# ── Helpers ───────────────────────────────────────────────────────────────────

def is_working_day(date):
    """Monday=0 … Saturday=5 are working days; Sunday=6 is off."""
    return date.weekday() < 6


# ── AttendanceLog ─────────────────────────────────────────────────────────────

class AttendanceLog(models.Model):
    """Daily attendance record for an employee."""

    class Status(models.TextChoices):
        PRESENT  = 'present',  'Present'
        LATE     = 'late',     'Late'
        HALF_DAY = 'half_day', 'Half Day'
        ABSENT   = 'absent',   'Absent'
        OVERTIME = 'overtime', 'Overtime'   # present + worked beyond shift

    # ── Shift config (office: 10:00 AM – 6:00 PM) ──
    LATE_HOUR          = 10   # late after 10:15 AM
    LATE_MINUTE        = 15
    EARLY_LOGOUT_HOUR  = 14   # logout before 2:00 PM → half day
    OVERTIME_HOUR      = 18   # worked past 6:00 PM → overtime
    HALF_DAY_HOURS     = 4    # less than 4 h worked → half day

    employee         = models.ForeignKey(
        'employees.Employee',
        on_delete=models.CASCADE,
        related_name='attendance_logs',
    )
    date             = models.DateField(default=datetime.date.today)
    login_time       = models.DateTimeField(null=True, blank=True)
    logout_time      = models.DateTimeField(null=True, blank=True)
    total_work_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    overtime_hours   = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    ip_address       = models.GenericIPAddressField(null=True, blank=True)
    status           = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PRESENT
    )
    notes            = models.TextField(blank=True)
    is_regularized   = models.BooleanField(default=False)  # set True after approved regularization

    class Meta:
        unique_together = [['employee', 'date']]
        ordering = ['-date', '-login_time']

    def __str__(self):
        return f"{self.employee.full_name} — {self.date} ({self.status})"

    def auto_set_status(self):
        """Set present/late based on login_time vs 10:15 AM threshold."""
        if self.login_time:
            local_dt  = timezone.localtime(self.login_time)
            threshold = local_dt.replace(
                hour=self.LATE_HOUR, minute=self.LATE_MINUTE,
                second=0, microsecond=0,
            )
            self.status = (
                self.Status.LATE if local_dt > threshold else self.Status.PRESENT
            )

    def calculate_work_hours(self):
        """Compute total_work_hours + overtime_hours from login→logout delta."""
        if self.login_time and self.logout_time:
            delta = self.logout_time - self.login_time
            hours = round(delta.total_seconds() / 3600, 2)
            self.total_work_hours = max(hours, 0)

            local_logout = timezone.localtime(self.logout_time)

            # Early logout → half day (left before 2 PM)
            if (local_logout.hour < self.EARLY_LOGOUT_HOUR
                    and self.status not in (self.Status.LATE, self.Status.ABSENT)):
                self.status = self.Status.HALF_DAY

            # Less than HALF_DAY_HOURS worked → half day
            elif (0 < float(self.total_work_hours) < self.HALF_DAY_HOURS
                  and self.status not in (self.Status.LATE, self.Status.ABSENT)):
                self.status = self.Status.HALF_DAY

            # Overtime: logged out after 6 PM and was Present
            shift_end_dt = local_logout.replace(
                hour=self.OVERTIME_HOUR, minute=0, second=0, microsecond=0
            )
            if local_logout > shift_end_dt and self.status == self.Status.PRESENT:
                overtime = round((local_logout - shift_end_dt).total_seconds() / 3600, 2)
                self.overtime_hours = max(overtime, 0)
                self.status = self.Status.OVERTIME

    def save(self, *args, **kwargs):
        self.calculate_work_hours()
        super().save(*args, **kwargs)


# ── UserPresence ──────────────────────────────────────────────────────────────

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


# ── AttendanceRegularization ──────────────────────────────────────────────────

class AttendanceRegularization(models.Model):
    """Employee requests correction for a missed / wrong attendance record."""

    class ReqStatus(models.TextChoices):
        PENDING  = 'pending',  'Pending'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    class ReqType(models.TextChoices):
        FORGOT_CHECKIN  = 'forgot_checkin',  'Forgot to Check-in'
        FORGOT_CHECKOUT = 'forgot_checkout', 'Forgot to Check-out'
        WRONG_TIME      = 'wrong_time',      'Wrong Time Recorded'
        ABSENT_BUT_PRESENT = 'absent_but_present', 'Was Present (marked absent)'
        OTHER           = 'other', 'Other'

    employee      = models.ForeignKey(
        'employees.Employee',
        on_delete=models.CASCADE,
        related_name='regularizations',
    )
    date          = models.DateField()
    req_type      = models.CharField(max_length=30, choices=ReqType.choices, default=ReqType.OTHER)
    reason        = models.TextField()
    requested_login_time  = models.TimeField(null=True, blank=True)
    requested_logout_time = models.TimeField(null=True, blank=True)
    status        = models.CharField(
        max_length=20, choices=ReqStatus.choices, default=ReqStatus.PENDING
    )
    reviewed_by   = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='reviewed_regularizations',
    )
    reviewed_at   = models.DateTimeField(null=True, blank=True)
    review_note   = models.TextField(blank=True)
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = [['employee', 'date']]

    def __str__(self):
        return f"{self.employee.full_name} — {self.date} ({self.status})"


# ── AttendanceStreak ──────────────────────────────────────────────────────────

class AttendanceStreak(models.Model):
    """Gamification: tracks on-time streaks per employee."""

    employee          = models.OneToOneField(
        'employees.Employee',
        on_delete=models.CASCADE,
        related_name='attendance_streak',
    )
    current_streak    = models.PositiveIntegerField(default=0)   # consecutive on-time days
    longest_streak    = models.PositiveIntegerField(default=0)   # all-time best
    total_on_time     = models.PositiveIntegerField(default=0)   # total present/overtime days
    total_late        = models.PositiveIntegerField(default=0)
    last_updated      = models.DateField(null=True, blank=True)

    def __str__(self):
        return f"{self.employee.full_name} — streak {self.current_streak}"

    def update_from_log(self, log):
        """Called after every check-in to update streak counters."""
        today = log.date
        if self.last_updated == today:
            return  # already updated today

        on_time = log.status in (
            AttendanceLog.Status.PRESENT, AttendanceLog.Status.OVERTIME
        )

        if on_time:
            self.current_streak += 1
            self.total_on_time  += 1
            self.longest_streak  = max(self.longest_streak, self.current_streak)
        elif log.status == AttendanceLog.Status.LATE:
            self.current_streak = 0   # streak breaks on late arrival
            self.total_late     += 1
        elif log.status == AttendanceLog.Status.ABSENT:
            self.current_streak = 0

        self.last_updated = today
        self.save()
