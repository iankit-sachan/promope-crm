"""
Notification model - user-facing alerts for important events.
"""

from django.db import models


class Notification(models.Model):
    class Type(models.TextChoices):
        TASK_ASSIGNED = 'task_assigned', 'Task Assigned'
        TASK_COMPLETED = 'task_completed', 'Task Completed'
        TASK_OVERDUE = 'task_overdue', 'Task Overdue'
        TASK_UPDATED = 'task_updated', 'Task Updated'
        SYSTEM = 'system', 'System'

    class Priority(models.TextChoices):
        LOW = 'low', 'Low'
        NORMAL = 'normal', 'Normal'
        HIGH = 'high', 'High'

    recipient = models.ForeignKey(
        'authentication.User',
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    title = models.CharField(max_length=255)
    message = models.TextField()
    type = models.CharField(max_length=30, choices=Type.choices, default=Type.SYSTEM)
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.NORMAL)

    # Link to related object
    link = models.CharField(max_length=255, blank=True)  # Frontend URL
    target_type = models.CharField(max_length=50, blank=True)
    target_id = models.PositiveIntegerField(null=True, blank=True)

    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']

    def __str__(self):
        return f'[{self.type}] {self.title} → {self.recipient}'

    def mark_read(self):
        from django.utils import timezone
        self.is_read = True
        self.read_at = timezone.now()
        self.save(update_fields=['is_read', 'read_at'])


class AppVersion(models.Model):
    """
    Tracks the latest published Android (or iOS) app version.
    HR/Founder creates a new row each time a new APK is released.
    The mobile app checks this on startup and prompts users to update.
    """
    platform      = models.CharField(max_length=20, default='android')
    version_name  = models.CharField(max_length=20)   # e.g. "1.2"
    version_code  = models.IntegerField()              # e.g. 3 (matches build.gradle versionCode)
    release_notes = models.TextField(blank=True)
    force_update  = models.BooleanField(default=False) # True = user must update before using app
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'app_versions'
        ordering = ['-version_code']
        get_latest_by = 'version_code'

    def __str__(self):
        return f'{self.platform} v{self.version_name} (build {self.version_code})'
