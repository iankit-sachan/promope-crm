"""
WebSocket consumers for real-time activity feed and notifications.
Uses Django Channels.
"""

import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async

logger = logging.getLogger(__name__)


class ActivityFeedConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for the global activity feed (founder dashboard).
    All connected clients join the 'activity_feed' group and receive
    broadcasts whenever log_activity() is called anywhere in the app.

    Connect URL: ws://localhost:8000/ws/activity/
    """

    GROUP_NAME = 'activity_feed'

    async def connect(self):
        user = self.scope.get('user')
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return

        # Only founder / admin / hr can watch the global activity feed.
        # Managers and employees are not permitted to see other users' activity.
        if not user.is_hr_or_above:
            await self.close(code=4003)
            return

        await self.channel_layer.group_add(self.GROUP_NAME, self.channel_name)
        await self.accept()

        # Send last 20 activities on connect
        recent = await self._get_recent_activities()
        await self.send(text_data=json.dumps({
            'type': 'initial_feed',
            'data': recent,
        }))

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.GROUP_NAME, self.channel_name)

    async def receive(self, text_data):
        """Clients can send 'ping' to keep connection alive."""
        try:
            data = json.loads(text_data)
            if data.get('type') == 'ping':
                await self.send(text_data=json.dumps({'type': 'pong'}))
        except Exception:
            pass

    async def activity_message(self, event):
        """Called by channel layer when a new activity is broadcast."""
        await self.send(text_data=json.dumps({
            'type': 'new_activity',
            'data': event['data'],
        }))

    @database_sync_to_async
    def _get_recent_activities(self):
        from .models import ActivityLog
        from .serializers import ActivityLogSerializer
        qs = ActivityLog.objects.select_related('actor').order_by('-created_at')[:20]
        return ActivityLogSerializer(qs, many=True).data


class NotificationConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for per-user notifications.

    Connect URL: ws://localhost:8000/ws/notifications/
    Each user joins their own group: notifications_{user_id}
    """

    async def connect(self):
        user = self.scope.get('user')
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return

        self.group_name = f'notifications_{user.id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        # Send unread notification count
        count = await self._get_unread_count(user.id)
        await self.send(text_data=json.dumps({
            'type': 'unread_count',
            'count': count,
        }))

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def notification_message(self, event):
        """Receives notification broadcast and forwards to WebSocket client."""
        await self.send(text_data=json.dumps({
            'type': 'new_notification',
            'data': event['data'],
        }))

    @database_sync_to_async
    def _get_unread_count(self, user_id):
        from apps.notifications.models import Notification
        return Notification.objects.filter(recipient_id=user_id, is_read=False).count()
