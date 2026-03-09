"""
Task views - full CRUD + progress updates + comments + attachments.
"""

from django.db.models import Q
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import Task, TaskComment, TaskHistory, TaskAttachment
from .serializers import (
    TaskListSerializer, TaskDetailSerializer, TaskCreateSerializer,
    TaskProgressUpdateSerializer, TaskCommentSerializer, TaskAttachmentSerializer
)
from apps.authentication.permissions import IsManagerOrAbove
from apps.activity.utils import log_activity
from apps.notifications.utils import create_notification


class TaskListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/tasks/   - List tasks (filtered by role)
    POST /api/tasks/   - Create task
    Supports: filter by status/priority/department/assigned_to, search, ordering.
    """
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'priority', 'department', 'assigned_to']
    search_fields = ['name', 'description', 'task_id']
    ordering_fields = ['created_at', 'deadline', 'priority', 'status']
    ordering = ['-created_at']

    def get_queryset(self):
        user = self.request.user
        qs = Task.objects.select_related(
            'assigned_to', 'department', 'assigned_by'
        ).prefetch_related('comments').all()

        # Employees see only their tasks; managers+ see all
        if not user.is_manager_or_above:
            try:
                employee = user.employee_profile
                qs = qs.filter(assigned_to=employee)
            except Exception:
                return Task.objects.none()

        return qs

    def get_serializer_class(self):
        return TaskCreateSerializer if self.request.method == 'POST' else TaskListSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        response_data = TaskListSerializer(
            serializer.instance, context={'request': request}
        ).data
        headers = self.get_success_headers(serializer.data)
        return Response(response_data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        task = serializer.save()

        log_activity(
            actor=self.request.user,
            verb='task_created',
            description=f'{self.request.user.full_name} created task "{task.name}"',
            target_type='task',
            target_id=task.id,
            target_name=task.name,
        )

        # Notify assigned employee
        if task.assigned_to:
            create_notification(
                recipient=task.assigned_to.user,
                title='New Task Assigned',
                message=f'You have been assigned to task "{task.name}".',
                type='task_assigned',
                target_type='task',
                target_id=task.id,
                link=f'/tasks/{task.id}',
            )
            log_activity(
                actor=self.request.user,
                verb='task_assigned',
                description=f'Task "{task.name}" assigned to {task.assigned_to.full_name}',
                target_type='task',
                target_id=task.id,
                target_name=task.name,
            )


class TaskDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/tasks/{id}/   - Task detail
    PUT    /api/tasks/{id}/   - Update task
    DELETE /api/tasks/{id}/   - Delete task (manager+)
    """
    permission_classes = [IsAuthenticated]
    queryset = Task.objects.select_related(
        'assigned_to', 'department', 'assigned_by'
    ).prefetch_related('comments', 'attachments', 'history')

    def get_serializer_class(self):
        if self.request.method in ['PUT', 'PATCH']:
            return TaskDetailSerializer
        return TaskDetailSerializer

    def perform_update(self, serializer):
        old_instance = self.get_object()
        old_status = old_instance.status
        old_progress = old_instance.progress
        task = serializer.save()

        # Track status change in history
        if old_status != task.status:
            TaskHistory.objects.create(
                task=task,
                changed_by=self.request.user,
                field_name='status',
                old_value=old_status,
                new_value=task.status,
            )
            verb_map = {
                'in_progress': ('task_started', 'started'),
                'completed': ('task_completed', 'completed'),
                'delayed': ('task_delayed', 'marked delayed'),
            }
            verb, label = verb_map.get(task.status, ('task_updated', 'updated'))
            log_activity(
                actor=self.request.user,
                verb=verb,
                description=f'{self.request.user.full_name} {label} task "{task.name}"',
                target_type='task',
                target_id=task.id,
                target_name=task.name,
            )

            # Notify on completion
            if task.status == 'completed' and task.assigned_to:
                create_notification(
                    recipient=task.assigned_to.user,
                    title='Task Completed',
                    message=f'Task "{task.name}" marked as completed.',
                    type='task_completed',
                    target_type='task',
                    target_id=task.id,
                    link=f'/tasks/{task.id}',
                )

        elif old_progress != task.progress:
            TaskHistory.objects.create(
                task=task,
                changed_by=self.request.user,
                field_name='progress',
                old_value=str(old_progress),
                new_value=str(task.progress),
            )
            log_activity(
                actor=self.request.user,
                verb='progress_updated',
                description=f'Progress of "{task.name}" updated to {task.progress}%',
                target_type='task',
                target_id=task.id,
                target_name=task.name,
            )

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_manager_or_above:
            return Response(
                {'detail': 'Only managers can delete tasks.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def update_task_progress(request, pk):
    """
    PATCH /api/tasks/{id}/progress/
    Body: { status?, progress?, note? }
    Quick endpoint for updating task progress.
    """
    try:
        task = Task.objects.get(pk=pk)
    except Task.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    serializer = TaskProgressUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    data = serializer.validated_data
    old_status = task.status
    old_progress = task.progress
    note = data.pop('note', '')

    for field, value in data.items():
        setattr(task, field, value)
    task.save()

    if old_status != task.status:
        TaskHistory.objects.create(
            task=task, changed_by=request.user,
            field_name='status', old_value=old_status,
            new_value=task.status, note=note,
        )

    if old_progress != task.progress:
        TaskHistory.objects.create(
            task=task, changed_by=request.user,
            field_name='progress', old_value=str(old_progress),
            new_value=str(task.progress), note=note,
        )

    log_activity(
        actor=request.user,
        verb='progress_updated',
        description=f'{request.user.full_name} updated "{task.name}" to {task.progress}%',
        target_type='task',
        target_id=task.id,
        target_name=task.name,
    )

    return Response(TaskListSerializer(task).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_task_comment(request, pk):
    """
    POST /api/tasks/{id}/comments/
    Body: { content }
    """
    try:
        task = Task.objects.get(pk=pk)
    except Task.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    serializer = TaskCommentSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    comment = serializer.save(task=task, author=request.user)

    log_activity(
        actor=request.user,
        verb='comment_added',
        description=f'{request.user.full_name} commented on task "{task.name}"',
        target_type='task',
        target_id=task.id,
        target_name=task.name,
    )

    return Response(TaskCommentSerializer(comment).data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def upload_task_attachment(request, pk):
    """
    POST /api/tasks/{id}/attachments/
    Form data: file
    """
    try:
        task = Task.objects.get(pk=pk)
    except Task.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    file = request.FILES.get('file')
    if not file:
        return Response({'detail': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)

    attachment = TaskAttachment.objects.create(
        task=task,
        uploaded_by=request.user,
        file=file,
        filename=file.name,
        file_size=file.size,
    )

    return Response(TaskAttachmentSerializer(attachment).data, status=status.HTTP_201_CREATED)
