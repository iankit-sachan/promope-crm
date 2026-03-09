"""
Tracking models for Employee Activity Tracking System.

DailyWorkReport  — structured daily summary submitted by employees (with manager review).
TaskTimeLog      — start/stop timer records per employee per task.
"""

import datetime
from django.conf import settings
from django.db import models
from django.utils import timezone


class DailyWorkReport(models.Model):
    """
    Structured daily work report submitted by an employee.
    Managers/HR can review and approve/reject.
    Different from DailyWorkLog (which tracks M2M tasks); this captures
    numeric counts + free-text descriptions + blocker notes.
    """

    class Status(models.TextChoices):
        DRAFT     = 'draft',     'Draft'
        SUBMITTED = 'submitted', 'Submitted'
        REVIEWED  = 'reviewed',  'Reviewed'
        REJECTED  = 'rejected',  'Rejected'

    employee    = models.ForeignKey(
        'employees.Employee',
        on_delete=models.CASCADE,
        related_name='daily_reports',
    )
    report_date = models.DateField(default=datetime.date.today)

    # Task count snapshot for the day
    tasks_assigned  = models.PositiveSmallIntegerField(default=0)
    tasks_completed = models.PositiveSmallIntegerField(default=0)
    tasks_pending   = models.PositiveSmallIntegerField(default=0)
    hours_worked    = models.DecimalField(max_digits=4, decimal_places=2, default=0)

    # Free-text sections
    work_description = models.TextField(
        blank=True,
        help_text='What did you work on today?',
    )
    blockers = models.TextField(
        blank=True,
        help_text='Any blockers or issues encountered?',
    )
    plan_for_tomorrow = models.TextField(
        blank=True,
        help_text='What do you plan to work on tomorrow?',
    )

    # Workflow
    status      = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='reviewed_reports',
    )
    review_comment = models.TextField(blank=True)
    reviewed_at    = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table      = 'daily_work_reports'
        unique_together = [['employee', 'report_date']]
        ordering      = ['-report_date', 'employee']

    def __str__(self):
        return f'{self.employee.full_name} — {self.report_date} ({self.status})'

    @property
    def completion_rate(self):
        if self.tasks_assigned == 0:
            return 0.0
        return round(self.tasks_completed / self.tasks_assigned * 100, 1)


class TaskTimeLog(models.Model):
    """
    Timer record for an employee working on a specific task.
    Each start/stop creates one record. Active sessions have end_time=None.
    """

    employee   = models.ForeignKey(
        'employees.Employee',
        on_delete=models.CASCADE,
        related_name='time_logs',
    )
    task       = models.ForeignKey(
        'tasks.Task',
        on_delete=models.CASCADE,
        related_name='time_logs',
    )
    start_time       = models.DateTimeField(default=timezone.now)
    end_time         = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(default=0)
    notes            = models.TextField(blank=True)
    is_active        = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'task_time_logs'
        ordering = ['-start_time']

    def __str__(self):
        status = 'active' if self.is_active else f'{self.duration_minutes} min'
        return f'{self.employee.full_name} — {self.task.name} ({status})'

    def stop(self):
        """Stop the timer and compute duration_minutes."""
        if self.is_active:
            self.end_time = timezone.now()
            delta = self.end_time - self.start_time
            self.duration_minutes = max(int(delta.total_seconds() / 60), 0)
            self.is_active = False
            self.save(update_fields=['end_time', 'duration_minutes', 'is_active', 'updated_at'])

    @property
    def elapsed_minutes(self):
        """Minutes elapsed for active or completed session."""
        if self.is_active:
            delta = timezone.now() - self.start_time
            return max(int(delta.total_seconds() / 60), 0)
        return self.duration_minutes
