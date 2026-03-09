"""
ASGI config for Staff Management CRM.
Supports HTTP + WebSocket via Django Channels.

WebSocket auth uses JWT token passed as ?token=<access_token> query param.
"""

import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

django_asgi_app = get_asgi_application()

# Import URL patterns after app registry is ready
from apps.activity.routing       import websocket_urlpatterns as activity_ws
from apps.attendance.routing     import websocket_urlpatterns as presence_ws
from apps.chat.routing           import websocket_urlpatterns as chat_ws
from apps.remote_control.routing import websocket_urlpatterns as remote_ws
from apps.authentication.middleware import JWTAuthMiddlewareStack

application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': AllowedHostsOriginValidator(
        JWTAuthMiddlewareStack(
            URLRouter(activity_ws + presence_ws + chat_ws + remote_ws)
        )
    ),
})
