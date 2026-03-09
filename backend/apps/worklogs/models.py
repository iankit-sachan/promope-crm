"""
DailyWorkLog — tracks what each employee worked on per day.
Managers aggregate these into weekly/monthly reports.
"""

import datetime
from django.db import models


class DailyWorkLog(models.Model):
    """One log per employee per calendar day."""

    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        SUBMITTED = 'submitted', 'Submitted'

    employee = models.ForeignKey(
        'employees.Employee',
        on_delete=models.CASCADE,
        related_name='work_logs',
    )
    date = models.DateField(default=datetime.date.today)

    # What the employee did
    work_description = models.TextField(
        blank=True,
        help_text='Brief summary of work completed today',
    )
    hours_worked = models.DecimalField(
        max_digits=4, decimal_places=2, default=0,
        help_text='Total hours worked (e.g. 8.5)',
    )

    # Tasks for the day (many-to-many links to existing Task objects)
    tasks_assigned = models.ManyToManyField(
        'tasks.Task',
        related_name='assigned_in_logs',
        blank=True,
        help_text='Tasks the employee was working on today',
    )
    tasks_completed = models.ManyToManyField(
        'tasks.Task',
        related_name='completed_in_logs',
        blank=True,
        help_text='Tasks the employee completed today',
    )
    tasks_blocked = models.ManyToManyField(
        'tasks.Task',
        related_name='blocked_in_logs',
        blank=True,
        help_text='Tasks that are blocked and why',
    )

    # Submission state
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'daily_work_logs'
        unique_together = [['employee', 'date']]
        ordering = ['-date', 'employee']

    def __str__(self):
        return f'{self.employee.full_name} — {self.date}'

    # ── Computed properties ────────────────────────────────────────────────────

    @property
    def tasks_assigned_count(self):
        return self.tasks_assigned.count()

    @property
    def tasks_completed_count(self):
        return self.tasks_completed.count()

    @property
    def tasks_pending_count(self):
        return (
            self.tasks_assigned
            .exclude(id__in=self.tasks_completed.values_list('id', flat=True))
            .count()
        )

    @property
    def tasks_blocked_count(self):
        return self.tasks_blocked.count()

    @property
    def completion_rate(self):
        assigned = self.tasks_assigned_count
        if assigned == 0:
            return 0.0
        return round(self.tasks_completed_count / assigned * 100, 1)
