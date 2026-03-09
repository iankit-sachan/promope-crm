"""
Task and TaskComment models - the core of the task management system.
"""

from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator


def task_attachment_path(instance, filename):
    return f'task_attachments/{instance.task.task_id}/{filename}'


class Task(models.Model):
    class Priority(models.TextChoices):
        LOW = 'low', 'Low'
        MEDIUM = 'medium', 'Medium'
        HIGH = 'high', 'High'
        URGENT = 'urgent', 'Urgent'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        IN_PROGRESS = 'in_progress', 'In Progress'
        COMPLETED = 'completed', 'Completed'
        DELAYED = 'delayed', 'Delayed'
        CANCELLED = 'cancelled', 'Cancelled'

    # Identity
    task_id = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    # Assignment
    assigned_to = models.ForeignKey(
        'employees.Employee',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_tasks',
    )
    assigned_by = models.ForeignKey(
        'authentication.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='tasks_assigned_by_me',
    )
    department = models.ForeignKey(
        'departments.Department',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='tasks',
    )

    # Status and Priority
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)

    # Dates
    start_date = models.DateField(null=True, blank=True)
    deadline = models.DateField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    # Progress
    progress = models.IntegerField(
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )

    # Expected effort in hours (for manager task assignment planning)
    expected_hours = models.DecimalField(
        max_digits=5, decimal_places=2,
        null=True, blank=True,
        help_text='Estimated hours required to complete this task',
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tasks'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.task_id} — {self.name}'

    def save(self, *args, **kwargs):
        # Auto-generate task_id if not set
        if not self.task_id:
            last = Task.objects.order_by('-id').first()
            next_id = (last.id + 1) if last else 1
            self.task_id = f'TASK-{next_id:04d}'

        # Auto-set completed_at
        if self.status == self.Status.COMPLETED and not self.completed_at:
            from django.utils import timezone
            self.completed_at = timezone.now()
            self.progress = 100
        elif self.status != self.Status.COMPLETED:
            self.completed_at = None

        super().save(*args, **kwargs)

    @property
    def is_overdue(self):
        from django.utils import timezone
        if self.deadline and self.status not in ['completed', 'cancelled']:
            return self.deadline < timezone.now().date()
        return False


class TaskComment(models.Model):
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(
        'authentication.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='task_comments',
    )
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'task_comments'
        ordering = ['created_at']

    def __str__(self):
        return f'Comment by {self.author} on {self.task}'


class TaskAttachment(models.Model):
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='attachments')
    uploaded_by = models.ForeignKey(
        'authentication.User',
        on_delete=models.SET_NULL,
        null=True,
    )
    file = models.FileField(upload_to=task_attachment_path)
    filename = models.CharField(max_length=255)
    file_size = models.PositiveIntegerField(default=0)  # bytes
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'task_attachments'

    def __str__(self):
        return f'{self.filename} — {self.task.task_id}'


class TaskHistory(models.Model):
    """Immutable audit trail of task changes."""
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='history')
    changed_by = models.ForeignKey(
        'authentication.User',
        on_delete=models.SET_NULL,
        null=True,
    )
    field_name = models.CharField(max_length=100)
    old_value = models.TextField(blank=True)
    new_value = models.TextField(blank=True)
    changed_at = models.DateTimeField(auto_now_add=True)
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = 'task_history'
        ordering = ['-changed_at']

    def __str__(self):
        return f'{self.task.task_id}: {self.field_name} changed by {self.changed_by}'
