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

    # Broadcast data_sync to all online users so web + mobile auto-refresh
    if verb in _VERB_SYNC_MAP:
        resource_type, action = _VERB_SYNC_MAP[verb]
        broadcast_data_sync(resource_type=resource_type, resource_id=target_id, action=action)

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


# Maps log_activity() verb → (resource_type, action) for data_sync broadcasts
_VERB_SYNC_MAP = {
    'task_created':      ('task',      'created'),
    'task_assigned':     ('task',      'updated'),
    'task_started':      ('task',      'updated'),
    'task_updated':      ('task',      'updated'),
    'task_completed':    ('task',      'updated'),
    'task_delayed':      ('task',      'updated'),
    'task_cancelled':    ('task',      'deleted'),
    'employee_added':    ('employee',  'created'),
    'employee_updated':  ('employee',  'updated'),
    'employee_deleted':  ('employee',  'deleted'),
    'salary_updated':    ('salary',    'updated'),
    'salary_paid':       ('salary',    'updated'),
    'payslip_generated': ('payslip',   'created'),
    'progress_updated':          ('task',          'updated'),
    'daily_report_submitted':    ('daily_report',  'created'),
    'daily_report_reviewed':     ('daily_report',  'updated'),
}


def broadcast_data_sync(resource_type, resource_id=None, action='updated'):
    """
    Push a lightweight data_sync envelope to every online user's notification WS group.
    The frontend (web + Android WebView) receives this and calls
    queryClient.invalidateQueries() for the relevant cache key — triggering an
    instant silent refetch without any visible loading state.

    resource_type: 'task' | 'employee' | 'attendance' | 'salary' | 'payslip'
    resource_id:   optional PK of the changed object
    action:        'created' | 'updated' | 'deleted'
    """
    from django.contrib.auth import get_user_model
    User = get_user_model()

    payload = {
        'type': 'notification_message',
        'data': {
            'msg_type':      'data_sync',
            'resource_type': resource_type,
            'resource_id':   resource_id,
            'action':        action,
        }
    }
    try:
        channel_layer = get_channel_layer()
        # Only broadcast to users currently marked online — avoids blasting dead groups
        user_ids = list(
            User.objects.filter(is_active=True, is_online=True).values_list('id', flat=True)
        )
        for uid in user_ids:
            async_to_sync(channel_layer.group_send)(f'notifications_{uid}', payload)
    except Exception as e:
        logger.warning(f'data_sync broadcast failed: {e}')
