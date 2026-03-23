from django.urls import path
from . import views

urlpatterns = [
    # Employee self-service
    path('checkin/',  views.checkin_view,            name='attendance-checkin'),
    path('checkout/', views.checkout_view,           name='attendance-checkout'),
    path('today/',    views.today_view,              name='attendance-today'),
    path('my/',       views.MyAttendanceView.as_view(), name='attendance-my'),
    path('my-score/', views.my_score_view,           name='attendance-my-score'),

    # Regularization
    path('regularization/',               views.my_regularization_view,   name='attendance-regularization'),
    path('regularization/admin/',         views.admin_regularization_list, name='attendance-regularization-admin'),
    path('regularization/<int:pk>/review/', views.review_regularization,  name='attendance-regularization-review'),

    # Admin
    path('presence/',    views.presence_dashboard_view,      name='attendance-presence'),
    path('leaderboard/', views.leaderboard_view,             name='attendance-leaderboard'),
    path('anomalies/',   views.anomaly_alerts_view,          name='attendance-anomalies'),
    path('auto-absent/', views.trigger_auto_absent,          name='attendance-auto-absent'),
    path('',             views.AdminAttendanceView.as_view(), name='attendance-list'),
]
