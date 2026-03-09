"""
Chat & Messaging models.

DirectConversation  — one-to-one DM between two users
ChatGroup           — group chat with N members
GroupMembership     — through-table for group membership + role
Message             — message in either a DM or group (text/file/image/pdf/link)
MessageReadReceipt  — tracks who read which message
PdfReport           — employee-submitted PDF with admin approval workflow
"""

import uuid
import os

from django.conf import settings
from django.db import models
from django.utils import timezone


# ── Upload helpers ─────────────────────────────────────────────────────────────

def chat_file_path(instance, filename):
    ext = os.path.splitext(filename)[1].lower()
    return f'chat/files/{uuid.uuid4().hex}{ext}'


def report_file_path(instance, filename):
    ext = os.path.splitext(filename)[1].lower()
    return f'reports/{uuid.uuid4().hex}{ext}'


# ── Direct Conversation ────────────────────────────────────────────────────────

class DirectConversation(models.Model):
    participants = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name='direct_conversations',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f'DM #{self.pk}'

    @classmethod
    def get_or_create_between(cls, user1, user2):
        """Return (conversation, created) for the DM between two users."""
        conv = (
            cls.objects
            .filter(participants=user1)
            .filter(participants=user2)
            .first()
        )
        if conv:
            return conv, False
        conv = cls.objects.create()
        conv.participants.add(user1, user2)
        return conv, True


# ── Group Chat ─────────────────────────────────────────────────────────────────

class ChatGroup(models.Model):
    name        = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    created_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_chat_groups',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return self.name


class GroupMembership(models.Model):
    ADMIN  = 'admin'
    MEMBER = 'member'
    ROLE_CHOICES = [(ADMIN, 'Admin'), (MEMBER, 'Member')]

    group     = models.ForeignKey(ChatGroup, on_delete=models.CASCADE, related_name='memberships')
    user      = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='chat_memberships')
    role      = models.CharField(max_length=10, choices=ROLE_CHOICES, default=MEMBER)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [['group', 'user']]

    def __str__(self):
        return f'{self.user} in {self.group} ({self.role})'


# ── Messages ───────────────────────────────────────────────────────────────────

class Message(models.Model):
    TEXT  = 'text'
    FILE  = 'file'
    IMAGE = 'image'
    PDF   = 'pdf'
    LINK  = 'link'
    TYPE_CHOICES = [
        (TEXT,  'Text'),
        (FILE,  'File'),
        (IMAGE, 'Image'),
        (PDF,   'PDF'),
        (LINK,  'Link'),
    ]

    # Exactly one of these should be set
    direct_conversation = models.ForeignKey(
        DirectConversation, on_delete=models.CASCADE,
        related_name='messages', null=True, blank=True,
    )
    group = models.ForeignKey(
        ChatGroup, on_delete=models.CASCADE,
        related_name='messages', null=True, blank=True,
    )

    sender       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='chat_messages')
    message_type = models.CharField(max_length=10, choices=TYPE_CHOICES, default=TEXT)
    content      = models.TextField(blank=True)
    file         = models.FileField(upload_to=chat_file_path, null=True, blank=True)
    file_name    = models.CharField(max_length=255, blank=True)
    file_size    = models.PositiveIntegerField(null=True, blank=True)
    is_deleted   = models.BooleanField(default=False)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'{self.sender} [{self.message_type}] {self.created_at:%H:%M}'


class MessageReadReceipt(models.Model):
    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name='read_receipts')
    user    = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='message_receipts')
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [['message', 'user']]


# ── PDF Reports ────────────────────────────────────────────────────────────────

class PdfReport(models.Model):
    TYPE_CHOICES = [
        ('daily',   'Daily Report'),
        ('weekly',  'Weekly Report'),
        ('project', 'Project Report'),
        ('other',   'Other'),
    ]
    PENDING  = 'pending'
    APPROVED = 'approved'
    REJECTED = 'rejected'
    STATUS_CHOICES = [
        (PENDING,  'Pending'),
        (APPROVED, 'Approved'),
        (REJECTED, 'Rejected'),
    ]

    submitter    = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='pdf_reports')
    title        = models.CharField(max_length=200)
    report_type  = models.CharField(max_length=10, choices=TYPE_CHOICES)
    file         = models.FileField(upload_to=report_file_path)
    file_name    = models.CharField(max_length=255)
    file_size    = models.PositiveIntegerField()
    description  = models.TextField(blank=True)

    status       = models.CharField(max_length=10, choices=STATUS_CHOICES, default=PENDING)
    admin_note   = models.TextField(blank=True)
    reviewed_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='reviewed_pdf_reports',
    )
    reviewed_at  = models.DateTimeField(null=True, blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.title} — {self.submitter}'
