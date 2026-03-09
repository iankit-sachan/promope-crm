"""
ChatConsumer — real-time WebSocket for direct messages and group chats.

URL: ws/chat/<room_type>/<room_id>/
  room_type: "direct" | "group"
  room_id:   pk of DirectConversation or ChatGroup

Protocol (JSON frames):
  Client → Server:
    { type: "read",    message_ids: [int, ...] }
    { type: "typing",  is_typing: bool }
  Server → Client:
    { type: "history",       messages: [...] }
    { type: "message",       ...msg fields }
    { type: "read_receipt",  message_ids: [...], user_id: int }
    { type: "typing",        user_id: int, user_name: str, is_typing: bool }

Text messages are sent via REST (POST /api/chat/.../send/) which then
broadcasts via channel_layer so all connected sockets receive them.
"""

import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser


class ChatConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        user = self.scope.get('user')
        if not user or isinstance(user, AnonymousUser) or not user.is_authenticated:
            await self.close(code=4001)
            return

        self.user      = user
        self.room_type = self.scope['url_route']['kwargs']['room_type']
        self.room_id   = int(self.scope['url_route']['kwargs']['room_id'])

        if not await self.check_access():
            await self.close(code=4003)
            return

        self.group_name = f'chat_{self.room_type}_{self.room_id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        # Mark all unread messages as read
        await self.mark_all_read()

        # Send last 60 messages as history
        messages = await self.get_history()
        await self.send(text_data=json.dumps({'type': 'history', 'messages': messages}))

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except (json.JSONDecodeError, ValueError):
            return

        t = data.get('type')
        if t == 'read':
            await self.handle_read(data.get('message_ids', []))
        elif t == 'typing':
            await self.channel_layer.group_send(self.group_name, {
                'type':      'typing_indicator',
                'user_id':   self.user.id,
                'user_name': self.user.full_name,
                'is_typing': data.get('is_typing', True),
            })

    async def handle_read(self, message_ids):
        if not message_ids:
            return
        await self.save_read_receipts(message_ids)
        await self.channel_layer.group_send(self.group_name, {
            'type':        'read_receipt',
            'message_ids': message_ids,
            'user_id':     self.user.id,
        })

    # ── channel_layer event handlers ─────────────────────────────────────────

    async def chat_message(self, event):
        """Receive broadcast from REST send view and forward to client."""
        await self.send(text_data=json.dumps({
            'type': 'message',
            **{k: v for k, v in event.items() if k != 'type'},
        }))

    async def read_receipt(self, event):
        await self.send(text_data=json.dumps({
            'type':        'read_receipt',
            'message_ids': event['message_ids'],
            'user_id':     event['user_id'],
        }))

    async def typing_indicator(self, event):
        # Don't echo back to the sender
        if event['user_id'] != self.user.id:
            await self.send(text_data=json.dumps({
                'type':      'typing',
                'user_id':   event['user_id'],
                'user_name': event['user_name'],
                'is_typing': event['is_typing'],
            }))

    # ── DB helpers ────────────────────────────────────────────────────────────

    @database_sync_to_async
    def check_access(self):
        from .models import DirectConversation, ChatGroup
        try:
            if self.room_type == 'direct':
                conv = DirectConversation.objects.get(pk=self.room_id)
                return conv.participants.filter(pk=self.user.pk).exists()
            else:
                group = ChatGroup.objects.get(pk=self.room_id)
                return group.memberships.filter(user=self.user).exists()
        except Exception:
            return False

    @database_sync_to_async
    def get_history(self, limit=60):
        from .models import Message
        if self.room_type == 'direct':
            qs = Message.objects.filter(
                direct_conversation_id=self.room_id, is_deleted=False
            ).select_related('sender').prefetch_related('read_receipts').order_by('-created_at')[:limit]
        else:
            qs = Message.objects.filter(
                group_id=self.room_id, is_deleted=False
            ).select_related('sender').prefetch_related('read_receipts').order_by('-created_at')[:limit]

        return [_msg_to_dict(m) for m in reversed(list(qs))]

    @database_sync_to_async
    def mark_all_read(self):
        from .models import Message, MessageReadReceipt
        if self.room_type == 'direct':
            unread = Message.objects.filter(
                direct_conversation_id=self.room_id, is_deleted=False,
            ).exclude(sender=self.user).exclude(read_receipts__user=self.user)
        else:
            unread = Message.objects.filter(
                group_id=self.room_id, is_deleted=False,
            ).exclude(sender=self.user).exclude(read_receipts__user=self.user)

        receipts = [MessageReadReceipt(message=m, user=self.user) for m in unread]
        MessageReadReceipt.objects.bulk_create(receipts, ignore_conflicts=True)

    @database_sync_to_async
    def save_read_receipts(self, message_ids):
        from .models import Message, MessageReadReceipt
        msgs = Message.objects.filter(pk__in=message_ids, is_deleted=False).exclude(sender=self.user)
        receipts = [MessageReadReceipt(message=m, user=self.user) for m in msgs]
        MessageReadReceipt.objects.bulk_create(receipts, ignore_conflicts=True)


def _msg_to_dict(msg):
    """Serialize a Message instance to a plain dict for WS transmission."""
    file_url = msg.file.url if msg.file else None

    sender_photo = None
    try:
        ep = msg.sender.employee_profile
        if ep.profile_photo:
            sender_photo = ep.profile_photo.url
    except Exception:
        pass

    return {
        'id':           msg.id,
        'sender_id':    msg.sender_id,
        'sender_name':  msg.sender.full_name,
        'sender_photo': sender_photo,
        'message_type': msg.message_type,
        'content':      msg.content,
        'file_url':     file_url,
        'file_name':    msg.file_name,
        'file_size':    msg.file_size,
        'is_deleted':   msg.is_deleted,
        'created_at':   msg.created_at.isoformat(),
        'read_by':      list(msg.read_receipts.values_list('user_id', flat=True)),
    }
