from django.db import models
from django.utils import timezone


def daily_report_attachment_path(instance, filename):
    # Works for both DailyReport (has report_date/employee) and DailyReportAttachment (has report FK)
    if hasattr(instance, 'report'):
        report = instance.report
    else:
        report = instance
    return f'daily_reports/{report.report_date.year}/{report.report_date.month:02d}/{report.employee.employee_id}_{filename}'


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
        ordering = ['-report_date', '-created_at']
        verbose_name = 'Daily Report'
        verbose_name_plural = 'Daily Reports'

    def __str__(self):
        return f'{self.employee.full_name} — {self.report_date} ({self.status})'

    @property
    def is_editable(self):
        """Employee can edit only if still pending and it's today's report."""
        return self.status == self.Status.PENDING and self.report_date == timezone.now().date()


class DailyReportAttachment(models.Model):
    """One row per uploaded file — allows multiple attachments per DailyReport."""
    report      = models.ForeignKey(
        DailyReport,
        on_delete=models.CASCADE,
        related_name='attachments',
    )
    file        = models.FileField(upload_to=daily_report_attachment_path)
    filename    = models.CharField(max_length=255, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['uploaded_at']

    def save(self, *args, **kwargs):
        if not self.filename and self.file:
            self.filename = self.file.name.split('/')[-1]
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.report} — {self.filename}'
