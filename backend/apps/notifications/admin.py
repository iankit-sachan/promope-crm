from django.contrib import admin
from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['recipient', 'type', 'title', 'is_read', 'created_at']
    list_filter = ['type', 'is_read', 'priority']
    search_fields = ['title', 'message', 'recipient__email']
