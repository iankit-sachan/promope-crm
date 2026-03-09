"""
Utility to create notifications and broadcast via WebSocket.
"""

from .models import Notification


def create_notification(recipient, title, message, type='system', priority='normal',
                         target_type='', target_id=None, link=''):
    """Create a notification and push it via WebSocket."""
    notification = Notification.objects.create(
        recipient=recipient,
        title=title,
        message=message,
        type=type,
        priority=priority,
        target_type=target_type,
        target_id=target_id,
        link=link,
    )

    # Broadcast via WebSocket
    from apps.activity.utils import send_notification_ws
    from .serializers import NotificationSerializer
    send_notification_ws(
        user_id=recipient.id,
        notification_data=NotificationSerializer(notification).data,
    )

    return notification
