from django.contrib import admin
from .models import Notification, AppVersion


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['recipient', 'type', 'title', 'is_read', 'created_at']
    list_filter = ['type', 'is_read', 'priority']
    search_fields = ['title', 'message', 'recipient__email']


@admin.register(AppVersion)
class AppVersionAdmin(admin.ModelAdmin):
    list_display = ['platform', 'version_name', 'version_code', 'force_update', 'created_at']
    list_filter = ['platform', 'force_update']
    ordering = ['-version_code']
