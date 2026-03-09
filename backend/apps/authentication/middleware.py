"""
JWT Authentication Middleware for Django Channels WebSockets.

Reads the JWT access token from the `?token=...` query param,
validates it with SimpleJWT, and sets scope['user'].

Usage in asgi.py:
    from apps.authentication.middleware import JWTAuthMiddlewareStack
    application = ProtocolTypeRouter({
        'websocket': JWTAuthMiddlewareStack(URLRouter(urlpatterns))
    })
"""

from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import AccessToken

User = get_user_model()


@database_sync_to_async
def get_user_from_jwt(token_string):
    """Validate JWT and return the corresponding User, or AnonymousUser."""
    try:
        token = AccessToken(token_string)
        user_id = token.get('user_id')
        if not user_id:
            return AnonymousUser()
        return User.objects.get(id=user_id)
    except (InvalidToken, TokenError, User.DoesNotExist, Exception):
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    """
    ASGI middleware that authenticates WebSocket connections via JWT token
    passed as a query-string parameter (?token=<access_token>).
    """

    async def __call__(self, scope, receive, send):
        if scope['type'] == 'websocket':
            query_string = scope.get('query_string', b'').decode('utf-8')
            params = parse_qs(query_string)
            token_list = params.get('token', [])
            if token_list:
                scope['user'] = await get_user_from_jwt(token_list[0])
            else:
                scope['user'] = AnonymousUser()

        return await super().__call__(scope, receive, send)


def JWTAuthMiddlewareStack(inner):
    """Drop-in replacement for AuthMiddlewareStack that uses JWT instead of sessions."""
    return JWTAuthMiddleware(inner)
