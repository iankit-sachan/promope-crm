from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import (
    DirectConversation, ChatGroup, GroupMembership,
    Message, PdfReport,
)

User = get_user_model()


# ── Minimal user representation ────────────────────────────────────────────────

class UserMiniSerializer(serializers.ModelSerializer):
    profile_photo = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = ['id', 'full_name', 'role', 'profile_photo', 'is_online', 'last_seen']

    def get_profile_photo(self, obj):
        try:
            ep = obj.employee_profile
            if ep.profile_photo:
                return ep.profile_photo.url
        except Exception:
            pass
        return None


# ── Messages ───────────────────────────────────────────────────────────────────

class MessageSerializer(serializers.ModelSerializer):
    sender_id    = serializers.IntegerField(source='sender.id',        read_only=True)
    sender_name  = serializers.CharField(source='sender.full_name',   read_only=True)
    sender_photo = serializers.SerializerMethodField()
    file_url     = serializers.SerializerMethodField()
    read_by      = serializers.SerializerMethodField()

    class Meta:
        model  = Message
        fields = [
            'id',
            'direct_conversation', 'group',
            'sender_id', 'sender_name', 'sender_photo',
            'message_type', 'content',
            'file_url', 'file_name', 'file_size',
            'is_deleted', 'created_at',
            'read_by',
        ]
        read_only_fields = ['id', 'created_at', 'is_deleted']

    def get_sender_photo(self, obj):
        try:
            ep = obj.sender.employee_profile
            if ep.profile_photo:
                return ep.profile_photo.url
        except Exception:
            pass
        return None

    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None

    def get_read_by(self, obj):
        return list(obj.read_receipts.values_list('user_id', flat=True))


# ── Direct Conversations ───────────────────────────────────────────────────────

class DirectConversationSerializer(serializers.ModelSerializer):
    other_user   = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model  = DirectConversation
        fields = ['id', 'other_user', 'last_message', 'unread_count', 'updated_at']

    def get_other_user(self, obj):
        request = self.context.get('request')
        if request:
            other = obj.participants.exclude(id=request.user.id).first()
            if other:
                return UserMiniSerializer(other, context=self.context).data
        return None

    def get_last_message(self, obj):
        msg = obj.messages.filter(is_deleted=False).last()
        if msg:
            text = msg.content if msg.message_type == 'text' else f'📎 {msg.file_name or msg.message_type}'
            return {
                'content':      text,
                'sender_id':    msg.sender_id,
                'message_type': msg.message_type,
                'created_at':   msg.created_at.isoformat(),
            }
        return None

    def get_unread_count(self, obj):
        request = self.context.get('request')
        if request:
            return (
                obj.messages
                .filter(is_deleted=False)
                .exclude(sender=request.user)
                .exclude(read_receipts__user=request.user)
                .count()
            )
        return 0


# ── Groups ─────────────────────────────────────────────────────────────────────

class GroupMembershipSerializer(serializers.ModelSerializer):
    user = UserMiniSerializer(read_only=True)

    class Meta:
        model  = GroupMembership
        fields = ['id', 'user', 'role', 'joined_at']


class ChatGroupSerializer(serializers.ModelSerializer):
    members      = GroupMembershipSerializer(source='memberships', many=True, read_only=True)
    member_count = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    my_role      = serializers.SerializerMethodField()

    class Meta:
        model  = ChatGroup
        fields = [
            'id', 'name', 'description', 'created_by',
            'members', 'member_count',
            'last_message', 'unread_count', 'my_role',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']

    def get_member_count(self, obj):
        return obj.memberships.count()

    def get_last_message(self, obj):
        msg = obj.messages.filter(is_deleted=False).last()
        if msg:
            text = msg.content if msg.message_type == 'text' else f'📎 {msg.file_name or msg.message_type}'
            return {
                'content':      text,
                'sender_id':    msg.sender_id,
                'sender_name':  msg.sender.full_name,
                'message_type': msg.message_type,
                'created_at':   msg.created_at.isoformat(),
            }
        return None

    def get_unread_count(self, obj):
        request = self.context.get('request')
        if request:
            return (
                obj.messages
                .filter(is_deleted=False)
                .exclude(sender=request.user)
                .exclude(read_receipts__user=request.user)
                .count()
            )
        return 0

    def get_my_role(self, obj):
        request = self.context.get('request')
        if request:
            m = obj.memberships.filter(user=request.user).first()
            return m.role if m else None
        return None


# ── PDF Reports ────────────────────────────────────────────────────────────────

class PdfReportSerializer(serializers.ModelSerializer):
    submitter_name   = serializers.CharField(source='submitter.full_name',   read_only=True)
    submitter_photo  = serializers.SerializerMethodField()
    reviewed_by_name = serializers.CharField(source='reviewed_by.full_name', read_only=True, allow_null=True, default=None)
    file_url         = serializers.SerializerMethodField()
    report_type_label = serializers.CharField(source='get_report_type_display', read_only=True)

    class Meta:
        model  = PdfReport
        fields = [
            'id',
            'submitter', 'submitter_name', 'submitter_photo',
            'title', 'report_type', 'report_type_label',
            'file_url', 'file_name', 'file_size', 'description',
            'status', 'admin_note',
            'reviewed_by', 'reviewed_by_name', 'reviewed_at',
            'created_at',
        ]
        read_only_fields = [
            'id', 'submitter', 'file_name', 'file_size',
            'status', 'reviewed_by', 'reviewed_at', 'created_at',
        ]

    def get_submitter_photo(self, obj):
        try:
            ep = obj.submitter.employee_profile
            if ep.profile_photo:
                return ep.profile_photo.url
        except Exception:
            pass
        return None

    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None
