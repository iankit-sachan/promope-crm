from django.db import models
from django.utils import timezone


def daily_report_attachment_path(instance, filename):
    return f'daily_reports/{instance.report_date.year}/{instance.report_date.month:02d}/{instance.employee.employee_id}_{filename}'


class DailyReport(models.Model):
    class Status(models.TextChoices):
        PENDING   = 'pending',   'Pending'
        SUBMITTED = 'submitted', 'Submitted'
        REVIEWED  = 'reviewed',  'Reviewed'

    employee         = models.ForeignKey(
        'employees.Employee',
        on_delete=models.CASCADE,
        related_name='employee_daily_reports',
    )
    report_date      = models.DateField()
    tasks_assigned   = models.TextField(help_text='Summary of tasks assigned today')
    tasks_completed  = models.TextField(help_text='Summary of tasks completed today')
    tasks_pending    = models.TextField(blank=True, help_text='Summary of tasks still pending')
    hours_worked     = models.DecimalField(max_digits=4, decimal_places=2)
    work_description = models.TextField(help_text='Detailed description of work done')
    blockers         = models.TextField(blank=True, help_text='Any blockers or issues faced')
    attachment       = models.FileField(
        upload_to=daily_report_attachment_path,
        null=True, blank=True,
        help_text='Optional supporting document',
    )
    status           = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING,
    )
    reviewed_by      = models.ForeignKey(
        'authentication.User',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='reviewed_daily_reports',
    )
    review_note      = models.TextField(blank=True)
    reviewed_at      = models.DateTimeField(null=True, blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [['employee', 'report_date']]
        ordering = ['-report_date', '-created_at']
        verbose_name = 'Daily Report'
        verbose_name_plural = 'Daily Reports'

    def __str__(self):
        return f'{self.employee.full_name} — {self.report_date} ({self.status})'

    @property
    def is_editable(self):
        """Employee can edit only if still pending and it's today's report."""
        return self.status == self.Status.PENDING and self.report_date == timezone.now().date()
