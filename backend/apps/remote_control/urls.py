from django.urls import path
from . import views

urlpatterns = [
    # Agent registration & listing
    path('agents/register/',   views.register_agent,   name='remote-agent-register'),
    path('agents/',            views.AgentListView.as_view(), name='remote-agent-list'),
    path('agents/my-token/',   views.my_agent_token,   name='remote-agent-my-token'),

    # Session management
    path('sessions/',          views.SessionListView.as_view(), name='remote-session-list'),
    path('sessions/request/',  views.request_session,  name='remote-session-request'),
    path('sessions/<int:session_id>/end/', views.end_session, name='remote-session-end'),
]
