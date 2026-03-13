"""
PresenceConsumer — real-time employee online/away/offline tracking.

Connect URL: ws://localhost:8000/ws/presence/

Message protocol (client → server):
    { "type": "ping" }   — mark user Online, update last_active
    { "type": "away" }   — mark user Away

Message protocol (server → client):
    { "type": "presence_snapshot", "users": [...], "summary": {...} }
"""

import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone


class PresenceConsumer(AsyncWebsocketConsumer):

    GLOBAL_GROUP = 'presence_all'

    # ── lifecycle ─────────────────────────────────────────────────────────────

    async def connect(self):
        self.user = self.scope.get('user')
        if not self.user or not self.user.is_authenticated:
            await self.close(code=4001)
            return

        self.user_group = f'presence_user_{self.user.id}'

        # All users join the global broadcast group
        await self.channel_layer.group_add(self.GLOBAL_GROUP, self.channel_name)
        await self.channel_layer.group_add(self.user_group,   self.channel_name)

        await self.set_presence('online')
        await self.accept()

        # Push an immediate snapshot so the connecting client is in sync
        await self.broadcast_snapshot()

    async def disconnect(self, close_code):
        # Guard: unauthenticated connections are closed in connect() before
        # accept(); disconnect() still fires — skip DB/group ops for them.
        if not getattr(self, 'user', None) or not self.user.is_authenticated:
            return

        await self.set_presence('offline')

        if hasattr(self, 'user_group'):
            await self.channel_layer.group_discard(self.GLOBAL_GROUP, self.channel_name)
            await self.channel_layer.group_discard(self.user_group,   self.channel_name)

        await self.broadcast_snapshot()

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except (json.JSONDecodeError, TypeError):
            return

        msg_type = data.get('type')
        if msg_type == 'ping':
            await self.set_presence('online')
        elif msg_type == 'away':
            await self.set_presence('away')
        elif msg_type == 'idle':
            await self.set_presence('idle')
        else:
            return   # unknown type — ignore

        await self.broadcast_snapshot()

    # ── channel-layer message handlers ───────────────────────────────────────

    async def presence_snapshot(self, event):
        """Forward a group broadcast to this WebSocket connection."""
        await self.send(text_data=json.dumps({
            'type':    'presence_snapshot',
            'users':   event['users'],
            'summary': event['summary'],
        }))

    async def presence_snapshot_refresh(self, event):
        """Triggered by REST update-status — push a fresh snapshot to all clients."""
        await self.broadcast_snapshot()

    # ── database helpers ──────────────────────────────────────────────────────

    @database_sync_to_async
    def set_presence(self, status: str):
        from .models import UserPresence
        presence, _ = UserPresence.objects.get_or_create(user=self.user)
        presence.status      = status
        presence.last_active = timezone.now()
        if status == 'online' and not presence.session_start:
            presence.session_start = timezone.now()
        if status == 'offline':
            presence.session_start = None
        presence.save(update_fields=['status', 'last_active', 'session_start'])

    @database_sync_to_async
    def get_presence_snapshot(self):
        """Return serialisable presence data for every employee."""
        from apps.employees.models import Employee
        from .models import UserPresence
        import datetime

        employees = Employee.objects.select_related(
            'user', 'department'
        ).prefetch_related('user__presence').all()

        today = datetime.date.today()
        from .models import AttendanceLog
        today_logs = {
            log.employee_id: log
            for log in AttendanceLog.objects.filter(date=today)
        }

        users = []
        for emp in employees:
            user = emp.user

            # User.is_online is the primary truth (updated by HTTP auth middleware)
            if user.is_online:
                st = 'online'
            else:
                try:
                    st = user.presence.status
                except UserPresence.DoesNotExist:
                    st = 'offline'

            try:
                p    = user.presence
                la   = p.last_active.isoformat()
                la_d = p.last_active_display
            except UserPresence.DoesNotExist:
                la   = user.last_seen.isoformat() if user.last_seen else None
                la_d = 'Never'

            log = today_logs.get(emp.id)
            users.append({
                'user_id':             user.id,
                'employee_id':         emp.id,
                'employee_code':       emp.employee_id,
                'full_name':           emp.full_name,
                'department':          emp.department.name if emp.department else None,
                'role':                user.role,
                'profile_photo':       emp.profile_photo.url if emp.profile_photo else None,
                'status':              st,
                'last_active':         la,
                'last_active_display': la_d,
                'login_time_str':      _fmt_time(log.login_time)  if log else None,
                'logout_time_str':     _fmt_time(log.logout_time) if log else None,
                'total_work_hours':    float(log.total_work_hours) if log else 0,
                'attendance_status':   log.status if log else 'absent',
                'checked_in':          bool(log and log.login_time),
            })

        summary = {
            'total':   len(users),
            'online':  sum(1 for u in users if u['status'] == 'online'),
            'away':    sum(1 for u in users if u['status'] == 'away'),
            'idle':    sum(1 for u in users if u['status'] == 'idle'),
            'offline': sum(1 for u in users if u['status'] == 'offline'),
            'present': sum(1 for u in users if u['checked_in']),
        }
        return users, summary

    async def broadcast_snapshot(self):
        users, summary = await self.get_presence_snapshot()
        await self.channel_layer.group_send(
            self.GLOBAL_GROUP,
            {'type': 'presence_snapshot', 'users': users, 'summary': summary},
        )


# ── helpers ───────────────────────────────────────────────────────────────────

def _fmt_time(dt):
    if not dt:
        return None
    from django.utils import timezone as tz
    return tz.localtime(dt).strftime('%I:%M %p')
