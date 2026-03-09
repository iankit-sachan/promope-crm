from django.contrib import admin
from .models import DirectConversation, ChatGroup, GroupMembership, Message, PdfReport


@admin.register(DirectConversation)
class DirectConversationAdmin(admin.ModelAdmin):
    list_display  = ['id', 'created_at', 'updated_at']
    filter_horizontal = ['participants']


@admin.register(ChatGroup)
class ChatGroupAdmin(admin.ModelAdmin):
    list_display = ['name', 'created_by', 'created_at']


@admin.register(GroupMembership)
class GroupMembershipAdmin(admin.ModelAdmin):
    list_display = ['group', 'user', 'role', 'joined_at']


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ['sender', 'message_type', 'content', 'created_at', 'is_deleted']
    list_filter  = ['message_type', 'is_deleted']


@admin.register(PdfReport)
class PdfReportAdmin(admin.ModelAdmin):
    list_display  = ['title', 'submitter', 'report_type', 'status', 'created_at']
    list_filter   = ['status', 'report_type']
    list_editable = ['status']
