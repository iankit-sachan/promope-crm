"""
Employee model - full employee profile linked to auth User.
"""

from django.db import models
from django.core.validators import RegexValidator


def employee_photo_path(instance, filename):
    return f'employee_photos/{instance.employee_id}/{filename}'


class Employee(models.Model):
    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        INACTIVE = 'inactive', 'Inactive'
        ON_LEAVE = 'on_leave', 'On Leave'

    # Link to auth user
    user = models.OneToOneField(
        'authentication.User',
        on_delete=models.CASCADE,
        related_name='employee_profile',
    )

    # Identity
    employee_id = models.CharField(max_length=20, unique=True)
    full_name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)

    phone_regex = RegexValidator(
        regex=r'^\+?1?\d{9,15}$',
        message="Phone number must be entered in the format: '+999999999'."
    )
    phone = models.CharField(validators=[phone_regex], max_length=17, blank=True)

    # Organization
    department = models.ForeignKey(
        'departments.Department',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='employees',
    )
    role = models.CharField(max_length=100)  # Job title e.g. "Senior Developer"
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)

    # Details
    joining_date = models.DateField()
    salary = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    address = models.TextField(blank=True)
    profile_photo = models.ImageField(
        upload_to=employee_photo_path, null=True, blank=True
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'employees'
        ordering = ['full_name']

    def __str__(self):
        return f'{self.employee_id} — {self.full_name}'

    @property
    def is_active_today(self):
        """Returns True if user logged in today."""
        from django.utils import timezone
        if not self.user.last_seen:
            return False
        return self.user.last_seen.date() == timezone.now().date()

    @property
    def tasks_completed(self):
        return self.assigned_tasks.filter(status='completed').count()

    @property
    def tasks_pending(self):
        return self.assigned_tasks.filter(status='pending').count()

    @property
    def tasks_in_progress(self):
        return self.assigned_tasks.filter(status='in_progress').count()

    @property
    def productivity_score(self):
        """
        Simple productivity score: % of assigned tasks completed.
        Returns 0-100.
        """
        total = self.assigned_tasks.count()
        if total == 0:
            return 0
        completed = self.tasks_completed
        return round((completed / total) * 100, 1)
