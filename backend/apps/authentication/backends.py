"""
Custom DRF authentication backend that keeps User.is_online / User.last_seen
and UserPresence in sync on every authenticated HTTP request.

Updates are throttled to at most once per 60 seconds per user to avoid
excessive DB writes on high-frequency polling endpoints.
"""

from django.utils import timezone
from rest_framework_simplejwt.authentication import JWTAuthentication


class OnlineTrackingJWTAuthentication(JWTAuthentication):
    """
    Drop-in replacement for JWTAuthentication.
    After validating the token it marks the user online and refreshes
    last_seen / UserPresence — but only if the previous write was more
    than UPDATE_INTERVAL seconds ago so we don't hammer the DB.
    """

    UPDATE_INTERVAL = 60  # seconds

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None

        user, validated_token = result
        self._touch_presence(user)
        return user, validated_token

    def _touch_presence(self, user):
        now = timezone.now()

        # Throttle: skip if already written recently
        if (
            user.is_online
            and user.last_seen is not None
            and (now - user.last_seen).total_seconds() < self.UPDATE_INTERVAL
        ):
            return

        # Update User fields
        user.is_online = True
        user.last_seen = now
        user.save(update_fields=['is_online', 'last_seen'])

        # Sync UserPresence record
        try:
            from apps.attendance.models import UserPresence
            presence, created = UserPresence.objects.get_or_create(user=user)
            if presence.status != 'online':
                presence.session_start = now
            presence.status      = 'online'
            presence.last_active = now
            presence.save(update_fields=['status', 'last_active', 'session_start'])
        except Exception:
            pass
