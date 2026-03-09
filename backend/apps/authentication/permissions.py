"""
Custom permission classes for role-based access control.
"""

from rest_framework.permissions import BasePermission


class IsFounder(BasePermission):
    """Only founders can access."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_founder)


class IsAdminOrAbove(BasePermission):
    """Founders and admins can access."""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.is_admin_or_above
        )


class IsManagerOrAbove(BasePermission):
    """Founders, admins, and managers can access."""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.is_manager_or_above
        )


class IsHROrAbove(BasePermission):
    """Founders, admins, and HR officers can access."""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.is_hr_or_above
        )


class IsOwnerOrAdminAbove(BasePermission):
    """Object owner or admin+ can access."""
    def has_object_permission(self, request, view, obj):
        if request.user.is_admin_or_above:
            return True
        # Check if object has 'user' or 'assigned_to' attribute
        owner = getattr(obj, 'user', None) or getattr(obj, 'assigned_to', None)
        return owner == request.user
