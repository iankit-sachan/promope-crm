from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.throttling import UserRateThrottle
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import OrderingFilter
from django.utils import timezone as tz
from .models import ActivityLog
from .serializers import ActivityLogSerializer
from .utils import log_activity
from apps.authentication.permissions import IsManagerOrAbove


class ActivityLogListView(generics.ListAPIView):
    """
    GET /api/activity/
    Returns paginated activity log. Founders and managers can see all;
    employees only see their own.
    """
    serializer_class = ActivityLogSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['verb', 'actor', 'target_type']
    ordering_fields = ['created_at']
    ordering = ['-created_at']

    def get_queryset(self):
        user = self.request.user
        qs = ActivityLog.objects.select_related('actor').all()
        if not user.is_hr_or_above:
            qs = qs.filter(actor=user)
        # Optional date filter
        date_from = self.request.query_params.get('date_from')
        date_to   = self.request.query_params.get('date_to')
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)
        return qs


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def log_page_visit(request):
    """
    POST /api/activity/log-visit/
    Body: { page: '/dashboard', page_title: 'Dashboard' }
    Silently records a page_visited event for the requesting user.
    """
    page       = request.data.get('page', '')
    page_title = request.data.get('page_title', page)

    if page:
        log_activity(
            actor=request.user,
            verb='page_visited',
            description=f'{request.user.full_name} visited {page_title}',
            target_type='page',
            target_name=page_title,
            extra_data={'path': page},
            ip_address=_get_client_ip(request),
        )

    return Response({'status': 'ok'})


def _get_client_ip(request):
    x_forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if x_forwarded:
        return x_forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', None)


class UpdateStatusView(APIView):
    """
    POST /api/activity/update-status/
    Body: { "status": "online" | "away" | "idle" | "offline" }
    REST fallback for status updates when WebSocket is unavailable.
    """
    permission_classes = [IsAuthenticated]
    throttle_classes   = [UserRateThrottle]

    def post(self, request):
        from apps.attendance.models import UserPresence
        status = request.data.get('status', '')
        valid  = {c.value for c in UserPresence.Status}
        if status not in valid:
            return Response({'error': f'status must be one of {sorted(valid)}'}, status=400)

        presence, _ = UserPresence.objects.get_or_create(user=request.user)
        presence.status = status
        if status == 'online':
            presence.last_active = tz.now()
        presence.save(update_fields=['status', 'last_active'])

        # Best-effort real-time broadcast to all connected presence clients
        try:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync
            channel_layer = get_channel_layer()
            if channel_layer:
                async_to_sync(channel_layer.group_send)(
                    'presence_all',
                    {'type': 'presence_snapshot_refresh'},
                )
        except Exception:
            pass  # graceful degradation when Redis is unavailable

        return Response({'status': status})


class UserStatusView(APIView):
    """
    GET /api/activity/user-status/
    Returns the current presence status of the authenticated user.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.attendance.models import UserPresence
        presence, _ = UserPresence.objects.get_or_create(user=request.user)
        return Response({
            'status':      presence.status,
            'last_active': presence.last_active.isoformat(),
        })
