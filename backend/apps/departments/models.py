"""
Department model - groups employees into logical business units.
"""

from django.db import models


class Department(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    head = models.ForeignKey(
        'employees.Employee',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='headed_department',
    )
    color = models.CharField(max_length=7, default='#6366f1')  # Hex color for UI
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'departments'
        ordering = ['name']

    def __str__(self):
        return self.name

    @property
    def employee_count(self):
        return self.employees.filter(status='active').count()

    @property
    def active_tasks_count(self):
        from apps.tasks.models import Task
        return Task.objects.filter(
            department=self,
            status__in=['pending', 'in_progress']
        ).count()
