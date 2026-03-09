from django.contrib import admin
from .models import Task, TaskComment, TaskHistory, TaskAttachment


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ['task_id', 'name', 'assigned_to', 'department', 'status', 'priority', 'progress', 'deadline']
    list_filter = ['status', 'priority', 'department']
    search_fields = ['task_id', 'name', 'description']
    ordering = ['-created_at']


@admin.register(TaskComment)
class TaskCommentAdmin(admin.ModelAdmin):
    list_display = ['task', 'author', 'created_at']


@admin.register(TaskHistory)
class TaskHistoryAdmin(admin.ModelAdmin):
    list_display = ['task', 'field_name', 'old_value', 'new_value', 'changed_by', 'changed_at']
    readonly_fields = ['task', 'field_name', 'old_value', 'new_value', 'changed_by', 'changed_at']
