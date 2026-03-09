"""
Authentication views - login, logout, register, profile.
"""

from django.utils import timezone
from rest_framework import status, generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from .models import User
from .serializers import (
    LoginSerializer, UserSerializer, RegisterSerializer, ChangePasswordSerializer
)
from apps.activity.utils import log_activity


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """
    POST /api/auth/login/
    Body: { email, password }
    Returns: { access, refresh, user }
    """
    serializer = LoginSerializer(data=request.data, context={'request': request})
    serializer.is_valid(raise_exception=True)

    user = serializer.validated_data['user']
    refresh = RefreshToken.for_user(user)

    # Mark user online immediately
    now = timezone.now()
    user.is_online = True
    user.last_seen = now
    user.save(update_fields=['is_online', 'last_seen'])

    # Sync UserPresence
    try:
        from apps.attendance.models import UserPresence
        presence, _ = UserPresence.objects.get_or_create(user=user)
        presence.status        = 'online'
        presence.last_active   = now
        presence.session_start = now
        presence.save(update_fields=['status', 'last_active', 'session_start'])
    except Exception:
        pass

    # Log the activity
    log_activity(
        actor=user,
        verb='logged_in',
        description=f'{user.full_name} logged in',
    )

    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': UserSerializer(user).data,
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """
    POST /api/auth/logout/
    Body: { refresh }
    Blacklists the refresh token.
    """
    try:
        refresh_token = request.data.get('refresh')
        token = RefreshToken(refresh_token)
        token.blacklist()

        # Mark offline
        now = timezone.now()
        request.user.is_online = False
        request.user.last_seen = now
        request.user.save(update_fields=['is_online', 'last_seen'])

        # Sync UserPresence
        try:
            from apps.attendance.models import UserPresence
            presence, _ = UserPresence.objects.get_or_create(user=request.user)
            presence.status        = 'offline'
            presence.last_active   = now
            presence.session_start = None
            presence.save(update_fields=['status', 'last_active', 'session_start'])
        except Exception:
            pass

        log_activity(
            actor=request.user,
            verb='logged_out',
            description=f'{request.user.full_name} logged out',
        )

        return Response({'detail': 'Logged out successfully.'}, status=status.HTTP_200_OK)
    except TokenError:
        return Response({'detail': 'Invalid token.'}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def profile_view(request):
    """
    GET  /api/auth/profile/  - Get current user profile
    PUT  /api/auth/profile/  - Update current user profile
    """
    if request.method == 'GET':
        return Response(UserSerializer(request.user).data)

    serializer = UserSerializer(request.user, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()

    log_activity(
        actor=request.user,
        verb='updated_profile',
        description=f'{request.user.full_name} updated their profile',
    )

    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password_view(request):
    """
    POST /api/auth/change-password/
    """
    serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response({'detail': 'Password changed successfully.'})


class RegisterView(generics.CreateAPIView):
    """
    POST /api/auth/register/
    Admin only - creates new user accounts.
    """
    from .permissions import IsAdminOrAbove
    serializer_class = RegisterSerializer
    permission_classes = [IsAuthenticated, IsAdminOrAbove]

    def perform_create(self, serializer):
        user = serializer.save()
        log_activity(
            actor=self.request.user,
            verb='created_user',
            description=f'{self.request.user.full_name} created account for {user.full_name}',
        )
