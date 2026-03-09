from django.urls import path
from . import views

urlpatterns = [
    # Employee self-service
    path('checkin/',  views.checkin_view,            name='attendance-checkin'),
    path('checkout/', views.checkout_view,           name='attendance-checkout'),
    path('today/',    views.today_view,              name='attendance-today'),
    path('my/',       views.MyAttendanceView.as_view(), name='attendance-my'),

    # Admin
    path('presence/', views.presence_dashboard_view, name='attendance-presence'),
    path('',          views.AdminAttendanceView.as_view(), name='attendance-list'),
]
