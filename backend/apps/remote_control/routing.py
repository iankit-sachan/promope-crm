from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    # Agent script connects here (auth via agent_token UUID)
    re_path(
        r'ws/remote/agent/(?P<agent_token>[0-9a-f\-]+)/$',
        consumers.RemoteAgentConsumer.as_asgi(),
    ),
    # Manager's browser connects here (auth via JWT ?token=)
    re_path(
        r'ws/remote/session/(?P<session_id>[0-9a-f\-]+)/$',
        consumers.RemoteViewerConsumer.as_asgi(),
    ),
    # Manager listens for agent online/offline events
    re_path(
        r'ws/remote/dashboard/$',
        consumers.RemoteDashboardConsumer.as_asgi(),
    ),
]
