"""
ActivityLog model - immutable record of every important system event.
This powers the live activity feed on the founder dashboard.
"""

from django.db import models


class ActivityLog(models.Model):
    class Verb(models.TextChoices):
        LOGGED_IN = 'logged_in', 'Logged In'
        LOGGED_OUT = 'logged_out', 'Logged Out'
        TASK_CREATED = 'task_created', 'Task Created'
        TASK_STARTED = 'task_started', 'Task Started'
        TASK_UPDATED = 'task_updated', 'Task Updated'
        TASK_COMPLETED = 'task_completed', 'Task Completed'
        TASK_ASSIGNED = 'task_assigned', 'Task Assigned'
        TASK_DELAYED = 'task_delayed', 'Task Delayed'
        TASK_CANCELLED = 'task_cancelled', 'Task Cancelled'
        EMPLOYEE_ADDED = 'employee_added', 'Employee Added'
        EMPLOYEE_UPDATED = 'employee_updated', 'Employee Updated'
        EMPLOYEE_DELETED = 'employee_deleted', 'Employee Deleted'
        UPDATED_PROFILE = 'updated_profile', 'Updated Profile'
        CREATED_USER = 'created_user', 'Created User'
        PROGRESS_UPDATED = 'progress_updated', 'Progress Updated'
        COMMENT_ADDED = 'comment_added', 'Comment Added'
        # Tracking verbs
        PAGE_VISITED             = 'page_visited',             'Page Visited'
        FILE_UPLOADED            = 'file_uploaded',            'File Uploaded'
        DOCUMENT_DOWNLOADED      = 'document_downloaded',      'Document Downloaded'
        DAILY_REPORT_SUBMITTED   = 'daily_report_submitted',   'Daily Report Submitted'
        TIMER_STARTED            = 'timer_started',            'Timer Started'
        TIMER_STOPPED            = 'timer_stopped',            'Timer Stopped'
        # HR/Payroll verbs (used by hr views)
        SALARY_STRUCTURE_CREATED = 'salary_structure_created', 'Salary Structure Created'
        SALARY_UPDATED           = 'salary_updated',           'Salary Updated'
        BANK_DETAILS_UPDATED     = 'bank_details_updated',     'Bank Details Updated'
        SALARY_PAYMENT_CREATED   = 'salary_payment_created',   'Salary Payment Created'
        SALARY_PAID              = 'salary_paid',              'Salary Paid'
        PAYSLIP_GENERATED        = 'payslip_generated',        'Payslip Generated'

    actor = models.ForeignKey(
        'authentication.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='activities',
    )
    verb = models.CharField(max_length=50, choices=Verb.choices)
    description = models.TextField()

    # Optional references to related objects
    target_type = models.CharField(max_length=50, blank=True)  # 'task', 'employee', etc.
    target_id = models.PositiveIntegerField(null=True, blank=True)
    target_name = models.CharField(max_length=255, blank=True)

    # Metadata
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    extra_data = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'activity_logs'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.actor} — {self.verb} at {self.created_at}'
