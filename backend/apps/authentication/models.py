"""
Custom User model with role-based access control.
Roles: founder, admin, hr, manager, employee
"""

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', User.Role.FOUNDER)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        FOUNDER = 'founder', 'Founder'
        ADMIN = 'admin', 'Admin'
        HR = 'hr', 'HR'
        MANAGER = 'manager', 'Manager'
        EMPLOYEE = 'employee', 'Employee'

    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.EMPLOYEE)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(auto_now_add=True)
    last_login = models.DateTimeField(null=True, blank=True)

    # Track online status
    is_online = models.BooleanField(default=False)
    last_seen = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name']

    class Meta:
        db_table = 'users'
        verbose_name = 'User'
        verbose_name_plural = 'Users'
        ordering = ['-date_joined']

    def __str__(self):
        return f'{self.full_name} ({self.email})'

    @property
    def is_founder(self):
        return self.role == self.Role.FOUNDER

    @property
    def is_admin_or_above(self):
        return self.role in [self.Role.FOUNDER, self.Role.ADMIN]

    @property
    def is_manager_or_above(self):
        return self.role in [self.Role.FOUNDER, self.Role.ADMIN, self.Role.HR, self.Role.MANAGER]

    @property
    def is_hr_or_above(self):
        return self.role in [self.Role.FOUNDER, self.Role.ADMIN, self.Role.HR]
