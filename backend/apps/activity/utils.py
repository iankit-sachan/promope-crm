"""
Utility functions for logging activity and broadcasting via WebSockets.
"""

import json
import logging
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def log_activity(actor, verb, description, target_type='', target_id=None,
                 target_name='', extra_data=None, ip_address=None):
    """
    Creates an ActivityLog entry and broadcasts it to the WebSocket group
    so the founder dashboard updates in real time.
    """
    from .models import ActivityLog

    log = ActivityLog.objects.create(
        actor=actor,
        verb=verb,
        description=description,
        target_type=target_type,
        target_id=target_id,
        target_name=target_name,
        extra_data=extra_data or {},
        ip_address=ip_address,
    )

    # Broadcast to WebSocket channel group
    _broadcast_activity(log)
    return log


def _broadcast_activity(log):
    """Send the new activity event to all connected WebSocket clients."""
    try:
        channel_layer = get_channel_layer()
        payload = {
            'type': 'activity_message',
            'data': {
                'id': log.id,
                'actor': {
                    'id': log.actor.id if log.actor else None,
                    'name': log.actor.full_name if log.actor else 'System',
                },
                'verb': log.verb,
                'description': log.description,
                'target_type': log.target_type,
                'target_id': log.target_id,
                'target_name': log.target_name,
                'created_at': log.created_at.isoformat(),
            }
        }
        async_to_sync(channel_layer.group_send)('activity_feed', payload)
    except Exception as e:
        # Don't crash the request if broadcast fails
        logger.warning(f'WebSocket broadcast failed: {e}')


def send_notification_ws(user_id, notification_data):
    """Send a real-time notification to a specific user's WebSocket channel."""
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'notifications_{user_id}',
            {
                'type': 'notification_message',
                'data': notification_data,
            }
        )
    except Exception as e:
        logger.warning(f'Notification WebSocket broadcast failed: {e}')
