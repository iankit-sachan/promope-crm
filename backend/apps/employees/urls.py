from django.urls import path
from . import views

urlpatterns = [
    path('', views.EmployeeListCreateView.as_view(), name='employee-list-create'),
    path('active-today/', views.active_employees_view, name='employee-active-today'),
    path('role-management/', views.role_management_list, name='role-management-list'),
    path('<int:pk>/', views.EmployeeDetailView.as_view(), name='employee-detail'),
    path('<int:pk>/activity/', views.employee_activity_view, name='employee-activity'),
    path('<int:pk>/tasks/', views.employee_tasks_view, name='employee-tasks'),
    path('<int:pk>/assign-hr/', views.assign_hr, name='assign-hr'),
    path('<int:pk>/remove-hr/', views.remove_hr, name='remove-hr'),
]
