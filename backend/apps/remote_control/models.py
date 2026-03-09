"""
Remote Control models.
  RemoteAgent  — one per employee machine that has the agent script running
  RemoteSession — a control session between a manager (controller) and an agent
"""

import uuid
from django.db import models
from apps.employees.models import Employee
from apps.authentication.models import User


class RemoteAgent(models.Model):
    """Registered agent on an employee's machine."""
    employee     = models.OneToOneField(
        Employee, on_delete=models.CASCADE, related_name='remote_agent'
    )
    machine_name = models.CharField(max_length=100)        # e.g. "Ankit-Laptop"
    agent_token  = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    is_online    = models.BooleanField(default=False)
    last_ping    = models.DateTimeField(null=True, blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.employee.full_name} — {self.machine_name}"


class RemoteSession(models.Model):
    class Status(models.TextChoices):
        PENDING  = 'pending',  'Pending'
        ACTIVE   = 'active',   'Active'
        REJECTED = 'rejected', 'Rejected'
        ENDED    = 'ended',    'Ended'

    session_id  = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    agent       = models.ForeignKey(RemoteAgent,  on_delete=models.CASCADE, related_name='sessions')
    controller  = models.ForeignKey(User, on_delete=models.CASCADE, related_name='controlled_sessions')
    status      = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    fps         = models.IntegerField(default=2)    # frames per second agent sends
    quality     = models.IntegerField(default=50)   # JPEG quality 1-100
    started_at  = models.DateTimeField(null=True, blank=True)
    ended_at    = models.DateTimeField(null=True, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Session {self.session_id} — {self.status}"
