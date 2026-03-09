"""
Remote Control WebSocket Consumers.

Three consumers:
  RemoteAgentConsumer    — employee's Python agent connects here
  RemoteViewerConsumer   — manager's browser connects here
  RemoteDashboardConsumer — manager's dashboard listens for agent online/offline events

Channel groups:
  agent_{agent_id}          — unicast to a specific agent
  session_{session_id}      — all viewers of an active session
  remote_control_managers   — all manager dashboards (for agent status updates)
"""

import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from django.utils import timezone

logger = logging.getLogger(__name__)


class RemoteAgentConsumer(AsyncWebsocketConsumer):
    """
    Employee's Python agent connects here.
    Authenticates via agent_token UUID (not JWT).
    Sends screen frames; receives control events and session signals.
    """

    async def connect(self):
        agent_token = self.scope['url_route']['kwargs']['agent_token']
        self.agent = await self.get_agent(agent_token)
        if not self.agent:
            await self.close(code=4001)
            return

        self.agent_group = f'agent_{self.agent.id}'
        await self.channel_layer.group_add(self.agent_group, self.channel_name)
        await self.mark_online(True)
        await self.accept()

        # Broadcast online status to all manager dashboards
        await self.channel_layer.group_send('remote_control_managers', {
            'type': 'agent_status',
            'agent_id': self.agent.id,
            'employee_name': self.agent.employee.full_name,
            'machine_name': self.agent.machine_name,
            'online': True,
        })
        logger.info(f'Agent connected: {self.agent.machine_name}')

    async def disconnect(self, close_code):
        if not hasattr(self, 'agent'):
            return
        await self.mark_online(False)
        # End any active session for this agent
        await self.end_active_sessions()
        await self.channel_layer.group_discard(self.agent_group, self.channel_name)
        await self.channel_layer.group_send('remote_control_managers', {
            'type': 'agent_status',
            'agent_id': self.agent.id,
            'employee_name': self.agent.employee.full_name,
            'machine_name': self.agent.machine_name,
            'online': False,
        })
        logger.info(f'Agent disconnected: {self.agent.machine_name}')

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except (json.JSONDecodeError, ValueError):
            return

        msg_type = data.get('type')

        if msg_type == 'frame':
            # Forward frame to all viewers of the active session
            session_id = await self.get_active_session_id()
            if session_id:
                await self.channel_layer.group_send(f'session_{session_id}', {
                    'type': 'screen_frame',
                    'data': data.get('data', ''),
                    'w': data.get('w'),
                    'h': data.get('h'),
                })

        elif msg_type == 'session_accept':
            session_id = data.get('session_id')
            session = await self.accept_session(session_id)
            if session:
                # Notify the viewer that session is now active
                await self.channel_layer.group_send(f'session_{session_id}', {
                    'type': 'session_update',
                    'event': 'accepted',
                    'session_id': str(session_id),
                    'fps': session.fps,
                    'quality': session.quality,
                })
                logger.info(f'Session accepted: {session_id}')

        elif msg_type == 'session_reject':
            session_id = data.get('session_id')
            await self.reject_session(session_id)
            await self.channel_layer.group_send(f'session_{session_id}', {
                'type': 'session_update',
                'event': 'rejected',
                'session_id': str(session_id),
            })
            logger.info(f'Session rejected: {session_id}')

        elif msg_type == 'ping':
            await self.update_ping()
            await self.send(text_data=json.dumps({'type': 'pong'}))

    # ── Channel layer message handlers (called by group_send) ─────────────────

    async def control_event(self, event):
        """Forward mouse/keyboard event from viewer to agent."""
        await self.send(text_data=json.dumps({
            'type':   event['action'],
            'x':      event.get('x'),
            'y':      event.get('y'),
            'button': event.get('button'),
            'key':    event.get('key'),
        }))

    async def session_update(self, event):
        """Forward session state change to agent (e.g. ended by manager)."""
        await self.send(text_data=json.dumps(event))

    # ── DB helpers ─────────────────────────────────────────────────────────────

    @database_sync_to_async
    def get_agent(self, token):
        from .models import RemoteAgent
        try:
            return RemoteAgent.objects.select_related('employee').get(agent_token=token)
        except RemoteAgent.DoesNotExist:
            return None

    @database_sync_to_async
    def mark_online(self, status):
        self.agent.is_online = status
        self.agent.last_ping = timezone.now()
        self.agent.save(update_fields=['is_online', 'last_ping'])

    @database_sync_to_async
    def update_ping(self):
        self.agent.last_ping = timezone.now()
        self.agent.save(update_fields=['last_ping'])

    @database_sync_to_async
    def get_active_session_id(self):
        from .models import RemoteSession
        session = RemoteSession.objects.filter(
            agent=self.agent, status='active'
        ).first()
        return str(session.session_id) if session else None

    @database_sync_to_async
    def accept_session(self, session_id):
        from .models import RemoteSession
        try:
            session = RemoteSession.objects.get(
                session_id=session_id, agent=self.agent, status='pending'
            )
            session.status = 'active'
            session.started_at = timezone.now()
            session.save(update_fields=['status', 'started_at'])
            return session
        except RemoteSession.DoesNotExist:
            return None

    @database_sync_to_async
    def reject_session(self, session_id):
        from .models import RemoteSession
        RemoteSession.objects.filter(
            session_id=session_id, agent=self.agent, status='pending'
        ).update(status='rejected')

    @database_sync_to_async
    def end_active_sessions(self):
        from .models import RemoteSession
        RemoteSession.objects.filter(
            agent=self.agent, status='active'
        ).update(status='ended', ended_at=timezone.now())


class RemoteViewerConsumer(AsyncWebsocketConsumer):
    """
    Manager's browser connects here to view and control an active session.
    Authenticates via JWT (?token= query param, handled by JWTAuthMiddlewareStack).
    """

    async def connect(self):
        user = self.scope.get('user')
        if not user or isinstance(user, AnonymousUser) or not user.is_authenticated:
            await self.close(code=4001)
            return
        if not user.is_manager_or_above:
            await self.close(code=4003)
            return

        self.user = user
        self.session_id = self.scope['url_route']['kwargs']['session_id']
        self.session_group = f'session_{self.session_id}'

        # Allow connecting while session is pending (will receive accepted/rejected event)
        session = await self.get_session(self.session_id)
        if not session or session.status not in ('pending', 'active'):
            await self.close(code=4004)
            return

        await self.channel_layer.group_add(self.session_group, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'session_group'):
            await self.channel_layer.group_discard(self.session_group, self.channel_name)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except (json.JSONDecodeError, ValueError):
            return

        msg_type = data.get('type')

        if msg_type in ('mouse_move', 'mouse_click', 'key'):
            # Forward control event to agent
            agent_id = await self.get_session_agent_id(self.session_id)
            if agent_id:
                await self.channel_layer.group_send(f'agent_{agent_id}', {
                    'type': 'control_event',
                    'action': msg_type,
                    'x':      data.get('x'),
                    'y':      data.get('y'),
                    'button': data.get('button'),
                    'key':    data.get('key'),
                })

        elif msg_type == 'end_session':
            await self.do_end_session(self.session_id)
            agent_id = await self.get_session_agent_id(self.session_id)
            if agent_id:
                await self.channel_layer.group_send(f'agent_{agent_id}', {
                    'type': 'session_update',
                    'event': 'ended',
                    'session_id': self.session_id,
                })
            await self.send(text_data=json.dumps({'type': 'session_update', 'event': 'ended'}))

    # ── Channel layer message handlers ─────────────────────────────────────────

    async def screen_frame(self, event):
        """Receive frame from agent, forward to manager's browser."""
        await self.send(text_data=json.dumps({
            'type': 'frame',
            'data': event['data'],
            'w':    event.get('w'),
            'h':    event.get('h'),
        }))

    async def session_update(self, event):
        """Forward session state change (accepted/rejected/ended) to manager."""
        await self.send(text_data=json.dumps(event))

    # ── DB helpers ─────────────────────────────────────────────────────────────

    @database_sync_to_async
    def get_session(self, session_id):
        from .models import RemoteSession
        try:
            return RemoteSession.objects.select_related('agent').get(session_id=session_id)
        except RemoteSession.DoesNotExist:
            return None

    @database_sync_to_async
    def get_session_agent_id(self, session_id):
        from .models import RemoteSession
        try:
            return RemoteSession.objects.get(session_id=session_id).agent_id
        except RemoteSession.DoesNotExist:
            return None

    @database_sync_to_async
    def do_end_session(self, session_id):
        from .models import RemoteSession
        RemoteSession.objects.filter(
            session_id=session_id, status__in=('active', 'pending')
        ).update(status='ended', ended_at=timezone.now())


class RemoteDashboardConsumer(AsyncWebsocketConsumer):
    """
    Manager's dashboard page connects here to receive real-time
    agent online/offline events without being in an active session.
    """

    async def connect(self):
        user = self.scope.get('user')
        if not user or isinstance(user, AnonymousUser) or not user.is_authenticated:
            await self.close(code=4001)
            return
        if not user.is_manager_or_above:
            await self.close(code=4003)
            return
        self.user = user
        await self.channel_layer.group_add('remote_control_managers', self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard('remote_control_managers', self.channel_name)

    async def receive(self, text_data):
        pass  # no messages from dashboard to server

    async def agent_status(self, event):
        await self.send(text_data=json.dumps(event))
