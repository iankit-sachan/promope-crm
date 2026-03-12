"""
Chat REST API views.

Endpoints:
  GET  /api/chat/conversations/                          — list my DMs
  POST /api/chat/conversations/create/                   — get-or-create DM {user_id}
  GET  /api/chat/conversations/<id>/messages/            — message history
  POST /api/chat/conversations/<id>/send/                — send (text or file)

  GET  /api/chat/groups/                                 — list my groups
  POST /api/chat/groups/                                 — create group
  GET|PATCH|DELETE /api/chat/groups/<id>/               — group detail
  GET  /api/chat/groups/<id>/messages/                   — message history
  POST /api/chat/groups/<id>/send/                       — send (text or file)
  POST /api/chat/groups/<id>/members/                    — add member (admin only)
  DELETE /api/chat/groups/<id>/members/<user_id>/        — remove member

  GET  /api/chat/reports/                                — my submitted reports
  POST /api/chat/reports/                                — submit PDF report
  GET  /api/chat/reports/admin/                          — all reports (manager+)
  GET|PATCH /api/chat/reports/<id>/                     — view / approve/reject
"""

import mimetypes

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .consumers import _msg_to_dict
from .models import (
    DirectConversation, ChatGroup, GroupMembership,
    Message, MessageReadReceipt, PdfReport,
)
from .serializers import (
    DirectConversationSerializer, ChatGroupSerializer,
    MessageSerializer, PdfReportSerializer,
)
from apps.authentication.permissions import IsManagerOrAbove

User = get_user_model()
channel_layer = get_channel_layer()


# ── Helpers ────────────────────────────────────────────────────────────────────

def _broadcast_message(room_type, room_id, msg):
    """Broadcast a saved Message to all connected WS clients in the room.
    Silently skips if Redis / channel layer is unavailable."""
    try:
        group_name = f'chat_{room_type}_{room_id}'
        payload = {'type': 'chat_message', **_msg_to_dict(msg)}
        async_to_sync(channel_layer.group_send)(group_name, payload)
    except Exception:
        pass  # REST response still succeeds even without real-time push


def _detect_message_type(file_obj):
    mime, _ = mimetypes.guess_type(file_obj.name)
    if mime:
        if mime.startswith('image/'):
            return 'image'
        if mime == 'application/pdf':
            return 'pdf'
    return 'file'


def _create_notification(user, title, message, notification_type='info'):
    try:
        from apps.notifications.models import Notification
        Notification.objects.create(
            user=user,
            title=title,
            message=message,
            notification_type=notification_type,
        )
    except Exception:
        pass


# ── Messageable Users ─────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def messageable_users(request):
    """
    Returns users the caller is allowed to DM, formatted for the chat popup picker.

    - Employees can only message HR, managers, admins and founders.
    - All other roles (hr / manager / admin / founder) can message everyone.

    Response: [{ id, full_name, email, role, profile_photo }]
    Supports ?search=<name|email> for live search filtering.
    """
    PRIVILEGED_ROLES = {'hr', 'manager', 'admin', 'founder'}
    caller = request.user
    caller_role = getattr(caller, 'role', 'employee')

    qs = User.objects.exclude(pk=caller.pk).filter(is_active=True)

    if caller_role == 'employee':
        qs = qs.filter(role__in=PRIVILEGED_ROLES)

    search = request.query_params.get('search', '').strip()
    if search:
        from django.db.models import Q
        qs = qs.filter(Q(full_name__icontains=search) | Q(email__icontains=search))

    qs = qs.select_related('employee_profile').order_by('full_name')

    data = [
        {
            'id': u.pk,
            'full_name': u.full_name or u.email,
            'email': u.email,
            'role': u.role,
            'profile_photo': (
                request.build_absolute_uri(u.employee_profile.profile_photo.url)
                if hasattr(u, 'employee_profile') and u.employee_profile
                   and u.employee_profile.profile_photo
                else None
            ),
        }
        for u in qs
    ]
    return Response(data)


# ── Direct Conversations ───────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_conversations(request):
    convs = (
        DirectConversation.objects
        .filter(participants=request.user)
        .prefetch_related('participants__employee_profile', 'messages__read_receipts')
    )
    return Response(DirectConversationSerializer(convs, many=True, context={'request': request}).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def get_or_create_conversation(request):
    """Body: { user_id: int }"""
    user_id = request.data.get('user_id')
    if not user_id:
        return Response({'detail': 'user_id is required.'}, status=400)
    try:
        other = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({'detail': 'User not found.'}, status=404)
    if other == request.user:
        return Response({'detail': 'Cannot chat with yourself.'}, status=400)

    conv, created = DirectConversation.get_or_create_between(request.user, other)
    s = DirectConversationSerializer(conv, context={'request': request})
    return Response(s.data, status=201 if created else 200)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def conversation_messages(request, conv_id):
    try:
        conv = DirectConversation.objects.get(pk=conv_id, participants=request.user)
    except DirectConversation.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)

    msgs = (
        conv.messages.filter(is_deleted=False)
        .select_related('sender')
        .prefetch_related('read_receipts')
    )
    # Mark as read
    unread = msgs.exclude(sender=request.user).exclude(read_receipts__user=request.user)
    MessageReadReceipt.objects.bulk_create(
        [MessageReadReceipt(message=m, user=request.user) for m in unread],
        ignore_conflicts=True,
    )
    return Response(MessageSerializer(msgs, many=True, context={'request': request}).data)


@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser, JSONParser])
@permission_classes([IsAuthenticated])
def send_direct_message(request, conv_id):
    try:
        conv = DirectConversation.objects.get(pk=conv_id, participants=request.user)
    except DirectConversation.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)

    content  = request.data.get('content', '').strip()
    file_obj = request.FILES.get('file')

    if not content and not file_obj:
        return Response({'detail': 'content or file is required.'}, status=400)

    msg_type  = 'text'
    file_name = ''
    file_size = None

    if file_obj:
        msg_type  = _detect_message_type(file_obj)
        file_name = file_obj.name
        file_size = file_obj.size

    msg = Message.objects.create(
        direct_conversation=conv,
        sender=request.user,
        message_type=msg_type,
        content=content,
        file=file_obj,
        file_name=file_name,
        file_size=file_size,
    )
    MessageReadReceipt.objects.get_or_create(message=msg, user=request.user)
    conv.save(update_fields=['updated_at'])

    # Broadcast via WS
    _broadcast_message('direct', conv_id, msg)

    # Notify the other participant
    for participant in conv.participants.exclude(pk=request.user.pk):
        snippet = content[:60] if content else f'Sent a {msg_type}'
        _create_notification(participant, f'Message from {request.user.full_name}', snippet)

    return Response(MessageSerializer(msg, context={'request': request}).data, status=201)


# ── Groups ─────────────────────────────────────────────────────────────────────

class ChatGroupListCreate(generics.ListCreateAPIView):
    serializer_class   = ChatGroupSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            ChatGroup.objects
            .filter(memberships__user=self.request.user)
            .prefetch_related('memberships__user__employee_profile')
            .distinct()
        )

    def perform_create(self, serializer):
        group = serializer.save(created_by=self.request.user)
        GroupMembership.objects.create(group=group, user=self.request.user, role='admin')
        # Add initial members
        for uid in self.request.data.get('member_ids', []):
            try:
                u = User.objects.get(pk=uid)
                if u != self.request.user:
                    m, created = GroupMembership.objects.get_or_create(
                        group=group, user=u, defaults={'role': 'member'}
                    )
                    if created:
                        _create_notification(u, 'Group invitation', f'You were added to "{group.name}"')
            except User.DoesNotExist:
                pass


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def group_detail(request, group_id):
    try:
        group      = ChatGroup.objects.prefetch_related('memberships__user').get(pk=group_id)
        membership = GroupMembership.objects.get(group=group, user=request.user)
    except (ChatGroup.DoesNotExist, GroupMembership.DoesNotExist):
        return Response({'detail': 'Not found.'}, status=404)

    if request.method == 'GET':
        return Response(ChatGroupSerializer(group, context={'request': request}).data)

    if membership.role != 'admin':
        return Response({'detail': 'Only group admins can modify this group.'}, status=403)

    if request.method == 'PATCH':
        s = ChatGroupSerializer(group, data=request.data, partial=True, context={'request': request})
        if s.is_valid():
            s.save()
            return Response(s.data)
        return Response(s.errors, status=400)

    # DELETE
    group.delete()
    return Response(status=204)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def group_add_member(request, group_id):
    try:
        group      = ChatGroup.objects.get(pk=group_id)
        membership = GroupMembership.objects.get(group=group, user=request.user)
    except (ChatGroup.DoesNotExist, GroupMembership.DoesNotExist):
        return Response({'detail': 'Not found.'}, status=404)

    if membership.role != 'admin':
        return Response({'detail': 'Only group admins can add members.'}, status=403)

    try:
        user = User.objects.get(pk=request.data.get('user_id'))
    except User.DoesNotExist:
        return Response({'detail': 'User not found.'}, status=404)

    _, created = GroupMembership.objects.get_or_create(group=group, user=user, defaults={'role': 'member'})
    if created:
        _create_notification(user, 'Group invitation', f'You were added to "{group.name}"')
    return Response({'detail': 'Member added.'}, status=201 if created else 200)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def group_remove_member(request, group_id, user_id):
    try:
        group      = ChatGroup.objects.get(pk=group_id)
        membership = GroupMembership.objects.get(group=group, user=request.user)
    except (ChatGroup.DoesNotExist, GroupMembership.DoesNotExist):
        return Response({'detail': 'Not found.'}, status=404)

    is_self   = request.user.id == int(user_id)
    is_admin  = membership.role == 'admin'
    if not is_admin and not is_self:
        return Response({'detail': 'Only group admins can remove other members.'}, status=403)

    GroupMembership.objects.filter(group=group, user_id=user_id).delete()
    return Response(status=204)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def group_messages(request, group_id):
    try:
        group = ChatGroup.objects.get(pk=group_id)
        if not group.memberships.filter(user=request.user).exists():
            return Response({'detail': 'Not a member.'}, status=403)
    except ChatGroup.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)

    msgs = (
        group.messages.filter(is_deleted=False)
        .select_related('sender')
        .prefetch_related('read_receipts')
    )
    unread = msgs.exclude(sender=request.user).exclude(read_receipts__user=request.user)
    MessageReadReceipt.objects.bulk_create(
        [MessageReadReceipt(message=m, user=request.user) for m in unread],
        ignore_conflicts=True,
    )
    return Response(MessageSerializer(msgs, many=True, context={'request': request}).data)


@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser, JSONParser])
@permission_classes([IsAuthenticated])
def send_group_message(request, group_id):
    try:
        group = ChatGroup.objects.get(pk=group_id)
        if not group.memberships.filter(user=request.user).exists():
            return Response({'detail': 'Not a member.'}, status=403)
    except ChatGroup.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)

    content  = request.data.get('content', '').strip()
    file_obj = request.FILES.get('file')

    if not content and not file_obj:
        return Response({'detail': 'content or file is required.'}, status=400)

    msg_type  = 'text'
    file_name = ''
    file_size = None

    if file_obj:
        msg_type  = _detect_message_type(file_obj)
        file_name = file_obj.name
        file_size = file_obj.size

    msg = Message.objects.create(
        group=group,
        sender=request.user,
        message_type=msg_type,
        content=content,
        file=file_obj,
        file_name=file_name,
        file_size=file_size,
    )
    MessageReadReceipt.objects.get_or_create(message=msg, user=request.user)
    group.save(update_fields=['updated_at'])

    _broadcast_message('group', group_id, msg)

    # Notify members (skip sender)
    snippet = content[:60] if content else f'Sent a {msg_type}'
    for m in group.memberships.exclude(user=request.user).select_related('user'):
        _create_notification(
            m.user,
            f'{request.user.full_name} in {group.name}',
            snippet,
        )

    return Response(MessageSerializer(msg, context={'request': request}).data, status=201)


# ── PDF Reports ────────────────────────────────────────────────────────────────

class MyReportListCreate(generics.ListCreateAPIView):
    serializer_class   = PdfReportSerializer
    permission_classes = [IsAuthenticated]
    parser_classes     = [MultiPartParser, FormParser]

    def get_queryset(self):
        return PdfReport.objects.filter(submitter=self.request.user)

    def create(self, request, *args, **kwargs):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'detail': 'file is required.'}, status=400)
        if not file_obj.name.lower().endswith('.pdf'):
            return Response({'detail': 'Only PDF files are accepted.'}, status=400)

        report = PdfReport.objects.create(
            submitter=request.user,
            title=request.data.get('title', file_obj.name),
            report_type=request.data.get('report_type', 'other'),
            file=file_obj,
            file_name=file_obj.name,
            file_size=file_obj.size,
            description=request.data.get('description', ''),
        )

        # Notify all managers / admins
        for mgr in User.objects.filter(role__in=['founder', 'admin', 'manager']):
            _create_notification(
                mgr,
                'PDF Report submitted',
                f'{request.user.full_name} submitted: {report.title}',
            )

        return Response(PdfReportSerializer(report, context={'request': request}).data, status=201)


class AdminReportListView(generics.ListAPIView):
    serializer_class   = PdfReportSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAbove]

    def get_queryset(self):
        qs = PdfReport.objects.select_related('submitter', 'reviewed_by').all()
        status_p = self.request.query_params.get('status')
        if status_p:
            qs = qs.filter(status=status_p)
        return qs


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def report_detail(request, report_id):
    try:
        report = PdfReport.objects.select_related('submitter', 'reviewed_by').get(pk=report_id)
    except PdfReport.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)

    is_manager = request.user.role in ('founder', 'admin', 'manager')
    if report.submitter != request.user and not is_manager:
        return Response({'detail': 'Forbidden.'}, status=403)

    if request.method == 'GET':
        return Response(PdfReportSerializer(report, context={'request': request}).data)

    # PATCH — manager review
    if not is_manager:
        return Response({'detail': 'Forbidden.'}, status=403)

    new_status = request.data.get('status')
    if new_status not in ('approved', 'rejected'):
        return Response({'detail': 'status must be "approved" or "rejected".'}, status=400)

    report.status      = new_status
    report.admin_note  = request.data.get('admin_note', report.admin_note)
    report.reviewed_by = request.user
    report.reviewed_at = timezone.now()
    report.save()

    note_text = f'  Note: {report.admin_note}' if report.admin_note else ''
    _create_notification(
        report.submitter,
        f'Report {new_status.capitalize()}',
        f'Your report "{report.title}" has been {new_status}.{note_text}',
        notification_type='success' if new_status == 'approved' else 'warning',
    )

    return Response(PdfReportSerializer(report, context={'request': request}).data)
