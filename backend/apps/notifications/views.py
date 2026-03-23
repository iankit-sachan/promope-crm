from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Notification, AppVersion
from .serializers import NotificationSerializer


class NotificationListView(generics.ListAPIView):
    """
    GET /api/notifications/
    Returns notifications for the current user, newest first.
    """
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user).order_by('-created_at')


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def mark_notification_read(request, pk):
    """PATCH /api/notifications/{id}/read/"""
    try:
        notification = Notification.objects.get(pk=pk, recipient=request.user)
    except Notification.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    notification.mark_read()
    return Response({'detail': 'Marked as read.'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_all_read(request):
    """POST /api/notifications/mark-all-read/"""
    from django.utils import timezone
    Notification.objects.filter(recipient=request.user, is_read=False).update(
        is_read=True, read_at=timezone.now()
    )
    return Response({'detail': 'All notifications marked as read.'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def unread_count(request):
    """GET /api/notifications/unread-count/"""
    count = Notification.objects.filter(recipient=request.user, is_read=False).count()
    return Response({'count': count})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def app_version(request):
    """
    GET /api/notifications/app-version/?platform=android
    Returns the latest published app version metadata.
    Mobile app checks this on startup to prompt for updates.
    """
    platform = request.query_params.get('platform', 'android')
    try:
        v = AppVersion.objects.filter(platform=platform).latest()
    except AppVersion.DoesNotExist:
        return Response({
            'version_code': 0,
            'version_name': '1.0',
            'force_update': False,
            'release_notes': '',
        })
    return Response({
        'version_code':  v.version_code,
        'version_name':  v.version_name,
        'force_update':  v.force_update,
        'release_notes': v.release_notes,
    })
