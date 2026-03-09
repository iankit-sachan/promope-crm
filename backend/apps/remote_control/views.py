"""
Remote Control REST API Views.

Endpoints (all under /api/remote/):
  POST   agents/register/           → agent registers itself (returns agent_token)
  GET    agents/                    → list all agents (manager+)
  GET    agents/<id>/token/         → fetch own agent token (employee only)
  POST   sessions/                  → manager requests a session
  GET    sessions/                  → list sessions (history)
  POST   sessions/<id>/end/         → end an active/pending session
"""

import logging
from django.utils import timezone
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.authentication.permissions import IsManagerOrAbove
from apps.activity.utils import log_activity
from apps.notifications.utils import create_notification

from .models import RemoteAgent, RemoteSession
from .serializers import RemoteAgentSerializer, RemoteSessionSerializer

logger = logging.getLogger(__name__)


def _get_client_ip(request):
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    return xff.split(',')[0].strip() if xff else request.META.get('REMOTE_ADDR', '')


# ── Agent endpoints ────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def register_agent(request):
    """
    Employee (or admin) registers a machine.
    Body: { machine_name, employee_id (optional, defaults to own employee) }
    Returns: { agent_token, agent_id, machine_name }
    """
    user = request.user
    machine_name = request.data.get('machine_name', '').strip()
    if not machine_name:
        return Response({'detail': 'machine_name is required.'}, status=400)

    # Resolve employee
    if request.data.get('employee_id') and user.is_manager_or_above:
        from apps.employees.models import Employee
        try:
            employee = Employee.objects.get(pk=request.data['employee_id'])
        except Employee.DoesNotExist:
            return Response({'detail': 'Employee not found.'}, status=404)
    else:
        try:
            employee = user.employee_profile
        except Exception:
            return Response({'detail': 'No employee profile found for this user.'}, status=400)

    agent, created = RemoteAgent.objects.get_or_create(
        employee=employee,
        defaults={'machine_name': machine_name},
    )
    if not created:
        agent.machine_name = machine_name
        agent.save(update_fields=['machine_name'])

    return Response({
        'agent_id':    agent.id,
        'agent_token': str(agent.agent_token),
        'machine_name': agent.machine_name,
        'created': created,
    })


class AgentListView(generics.ListAPIView):
    """List all registered agents. Manager+ only."""
    serializer_class   = RemoteAgentSerializer
    permission_classes = [IsManagerOrAbove]

    def get_queryset(self):
        qs = RemoteAgent.objects.select_related('employee', 'employee__department').order_by(
            '-is_online', 'employee__full_name'
        )
        if self.request.query_params.get('online') == 'true':
            qs = qs.filter(is_online=True)
        return qs


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_agent_token(request):
    """Return the agent token for the authenticated user's employee profile."""
    try:
        agent = request.user.employee_profile.remote_agent
        return Response({
            'agent_id':    agent.id,
            'agent_token': str(agent.agent_token),
            'machine_name': agent.machine_name,
        })
    except Exception:
        return Response({'detail': 'No agent registered for your account.'}, status=404)


# ── Session endpoints ──────────────────────────────────────────────────────────

class SessionListView(generics.ListAPIView):
    """Session history. Manager sees all; employee sees own."""
    serializer_class   = RemoteSessionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = RemoteSession.objects.select_related(
            'agent__employee', 'controller'
        ).order_by('-created_at')
        if not user.is_manager_or_above:
            qs = qs.filter(agent__employee__user=user)
        return qs


@api_view(['POST'])
@permission_classes([IsManagerOrAbove])
def request_session(request):
    """
    Manager requests a remote control session.
    Body: { agent_id, fps (optional), quality (optional) }
    Returns: session data + session_id to connect WebSocket.
    """
    agent_id = request.data.get('agent_id')
    if not agent_id:
        return Response({'detail': 'agent_id is required.'}, status=400)

    try:
        agent = RemoteAgent.objects.select_related('employee__user').get(pk=agent_id)
    except RemoteAgent.DoesNotExist:
        return Response({'detail': 'Agent not found.'}, status=404)

    if not agent.is_online:
        return Response({'detail': 'Agent is offline.'}, status=400)

    # Cancel any existing pending session for this agent from this controller
    RemoteSession.objects.filter(
        agent=agent, controller=request.user, status='pending'
    ).update(status='ended', ended_at=timezone.now())

    session = RemoteSession.objects.create(
        agent=agent,
        controller=request.user,
        fps=int(request.data.get('fps', 2)),
        quality=int(request.data.get('quality', 50)),
    )

    # Notify the agent via WebSocket
    channel_layer = get_channel_layer()
    try:
        async_to_sync(channel_layer.group_send)(
            f'agent_{agent.id}',
            {
                'type': 'session_update',
                'event': 'session_request',
                'session_id': str(session.session_id),
                'controller_name': request.user.full_name or request.user.email,
                'fps': session.fps,
                'quality': session.quality,
            }
        )
    except Exception as e:
        logger.warning(f'Failed to send session_request WS event: {e}')

    # CRM notification to the employee
    if agent.employee.user:
        create_notification(
            recipient=agent.employee.user,
            title='Remote Control Request',
            message=f'{request.user.full_name or request.user.email} is requesting remote access to {agent.machine_name}.',
            type='remote_control',
            priority='high',
            link='/remote-control',
            target_type='remote_session',
            target_id=session.id,
        )

    log_activity(
        actor=request.user,
        verb='remote_session_requested',
        description=f'{request.user.full_name or request.user.email} requested remote control of {agent.employee.full_name}\'s machine ({agent.machine_name})',
        target_type='remote_agent',
        target_id=agent.id,
        target_name=agent.machine_name,
        ip_address=_get_client_ip(request),
    )

    return Response(RemoteSessionSerializer(session).data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def end_session(request, session_id):
    """End an active or pending session. Both manager and employee can end."""
    try:
        session = RemoteSession.objects.select_related('agent').get(pk=session_id)
    except RemoteSession.DoesNotExist:
        return Response({'detail': 'Session not found.'}, status=404)

    user = request.user
    is_controller = session.controller_id == user.id
    is_employee   = session.agent.employee.user_id == user.id
    if not (is_controller or is_employee or user.is_admin_or_above):
        return Response({'detail': 'Not allowed.'}, status=403)

    if session.status not in ('active', 'pending'):
        return Response({'detail': f'Session already {session.status}.'}, status=400)

    session.status   = 'ended'
    session.ended_at = timezone.now()
    session.save(update_fields=['status', 'ended_at'])

    channel_layer = get_channel_layer()
    end_msg = {'type': 'session_update', 'event': 'ended', 'session_id': str(session.session_id)}
    try:
        async_to_sync(channel_layer.group_send)(f'session_{session.session_id}', end_msg)
        async_to_sync(channel_layer.group_send)(f'agent_{session.agent_id}', end_msg)
    except Exception as e:
        logger.warning(f'Failed to broadcast session_end: {e}')

    log_activity(
        actor=user,
        verb='remote_session_ended',
        description=f'Remote control session ended for {session.agent.machine_name}',
        target_type='remote_session',
        target_id=session.id,
        target_name=session.agent.machine_name,
        ip_address=_get_client_ip(request),
    )

    return Response({'detail': 'Session ended.', 'session_id': str(session.session_id)})
