from django.urls import path
from . import views

urlpatterns = [
    path('',               views.ActivityLogListView.as_view(), name='activity-list'),
    path('log-visit/',     views.log_page_visit,                name='activity-log-visit'),
    path('update-status/', views.UpdateStatusView.as_view(),    name='activity-update-status'),
    path('user-status/',   views.UserStatusView.as_view(),      name='activity-user-status'),
]
