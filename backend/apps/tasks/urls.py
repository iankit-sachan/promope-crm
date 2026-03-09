from django.urls import path
from . import views

urlpatterns = [
    path('', views.TaskListCreateView.as_view(), name='task-list-create'),
    path('<int:pk>/', views.TaskDetailView.as_view(), name='task-detail'),
    path('<int:pk>/progress/', views.update_task_progress, name='task-progress'),
    path('<int:pk>/comments/', views.add_task_comment, name='task-comments'),
    path('<int:pk>/attachments/', views.upload_task_attachment, name='task-attachments'),
]
