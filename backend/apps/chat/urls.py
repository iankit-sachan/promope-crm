from django.urls import path
from . import views

urlpatterns = [
    # ── Messageable users (for DM picker — accessible to all roles) ────────────
    path('users/',
         views.messageable_users,
         name='chat-messageable-users'),

    # ── Direct conversations ───────────────────────────────────────────────────
    path('conversations/',
         views.list_conversations,
         name='chat-conversations'),
    path('conversations/create/',
         views.get_or_create_conversation,
         name='chat-conv-create'),
    path('conversations/<int:conv_id>/messages/',
         views.conversation_messages,
         name='chat-conv-messages'),
    path('conversations/<int:conv_id>/send/',
         views.send_direct_message,
         name='chat-conv-send'),

    # ── Groups ─────────────────────────────────────────────────────────────────
    path('groups/',
         views.ChatGroupListCreate.as_view(),
         name='chat-groups'),
    path('groups/<int:group_id>/',
         views.group_detail,
         name='chat-group-detail'),
    path('groups/<int:group_id>/messages/',
         views.group_messages,
         name='chat-group-messages'),
    path('groups/<int:group_id>/send/',
         views.send_group_message,
         name='chat-group-send'),
    path('groups/<int:group_id>/members/',
         views.group_add_member,
         name='chat-group-add-member'),
    path('groups/<int:group_id>/members/<int:user_id>/',
         views.group_remove_member,
         name='chat-group-remove-member'),

    # ── PDF Reports ────────────────────────────────────────────────────────────
    path('reports/',
         views.MyReportListCreate.as_view(),
         name='chat-my-reports'),
    path('reports/admin/',
         views.AdminReportListView.as_view(),
         name='chat-admin-reports'),
    path('reports/<int:report_id>/',
         views.report_detail,
         name='chat-report-detail'),
]
