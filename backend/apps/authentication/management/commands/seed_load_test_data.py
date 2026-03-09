"""
Management command: seed_load_test_data

Creates deterministic test data for load testing the CRM.

Usage:
    python manage.py seed_load_test_data
    python manage.py seed_load_test_data --clear   # wipe loadtest users and reseed

Output:
    F:/CRM/load_tests/test_users.json
"""

import datetime
import json
import random
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.authentication.models import User
from apps.departments.models import Department
from apps.employees.models import Employee
from apps.tasks.models import Task
from apps.chat.models import ChatGroup, GroupMembership, DirectConversation

# ---------------------------------------------------------------------------
PASSWORD        = "LoadTest123!"
EMAIL_TEMPLATE  = "loadtest_user_{n:03d}@test.com"
OUTPUT_PATH     = Path(__file__).resolve().parents[5] / "load_tests" / "test_users.json"

DEPARTMENTS = [
    {"name": "Engineering",  "color": "#6366f1"},
    {"name": "Marketing",    "color": "#f59e0b"},
    {"name": "Finance",      "color": "#10b981"},
    {"name": "HR Dept",      "color": "#ef4444"},
    {"name": "Operations",   "color": "#3b82f6"},
]

# (role, count) — total = 100
ROLE_LAYOUT = [
    (User.Role.FOUNDER,  1),
    (User.Role.ADMIN,    2),
    (User.Role.HR,       2),
    (User.Role.MANAGER,  5),
    (User.Role.EMPLOYEE, 90),
]

JOB_TITLES = {
    User.Role.FOUNDER:  "CEO & Founder",
    User.Role.ADMIN:    "System Administrator",
    User.Role.HR:       "HR Specialist",
    User.Role.MANAGER:  "Engineering Manager",
    User.Role.EMPLOYEE: "Software Engineer",
}

TASK_NAMES = [
    "Implement authentication module",
    "Write unit tests for API",
    "Design database schema",
    "Review pull requests",
    "Update documentation",
    "Fix production bug",
    "Optimise SQL queries",
    "Create API endpoint",
    "Deploy to staging",
    "Conduct code review",
    "Set up CI/CD pipeline",
    "Refactor legacy code",
    "Analyse performance metrics",
    "Create dashboard widgets",
    "Integrate third-party API",
]

CHAT_GROUPS = [
    {"name": "Engineering Team",  "description": "Main engineering discussion channel"},
    {"name": "All Hands",         "description": "Company-wide announcements"},
    {"name": "Project Alpha",     "description": "Project Alpha sprint coordination"},
]
# ---------------------------------------------------------------------------


class Command(BaseCommand):
    help = "Seed deterministic load test data for 100 users."

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Delete existing loadtest users before reseeding",
        )

    def handle(self, *args, **options):
        if options["clear"]:
            self.stdout.write("Clearing existing load test data…")
            User.objects.filter(email__endswith="@test.com").delete()
            Department.objects.filter(name__in=[d["name"] for d in DEPARTMENTS]).delete()

        # Idempotency — skip if already seeded
        if User.objects.filter(email=EMAIL_TEMPLATE.format(n=1)).exists():
            self.stdout.write(
                self.style.WARNING(
                    "Load test data already exists. "
                    "Pass --clear to reseed. Re-generating JSON from DB."
                )
            )
            self._regenerate_json()
            return

        self.stdout.write("Seeding load test data…")
        with transaction.atomic():
            departments = self._create_departments()
            users_data  = self._create_users(departments)
            task_ids    = self._create_tasks(users_data, departments)
            conv_ids, chat_workers = self._create_direct_conversations(users_data)
            group_ids   = self._create_chat_groups(users_data)

        output = {
            "users":            users_data,
            "task_ids":         task_ids,
            "conversation_ids": conv_ids,
            "chat_workers":     chat_workers,
            "group_ids":        group_ids,
        }
        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(OUTPUT_PATH, "w") as f:
            json.dump(output, f, indent=2)

        self.stdout.write(self.style.SUCCESS(f"Done — credentials written to {OUTPUT_PATH}"))
        self.stdout.write(f"  Users:         {len(users_data)}")
        self.stdout.write(f"  Tasks:         {len(task_ids)}")
        self.stdout.write(f"  Conversations: {len(conv_ids)}")
        self.stdout.write(f"  Chat groups:   {len(group_ids)}")

    # ------------------------------------------------------------------ creators

    def _create_departments(self):
        departments = []
        for d in DEPARTMENTS:
            dept, created = Department.objects.get_or_create(
                name=d["name"],
                defaults={"description": f"{d['name']} department", "color": d["color"]},
            )
            departments.append(dept)
            self.stdout.write(f"  {'Created' if created else 'Found'} dept: {dept.name}")
        return departments

    def _create_users(self, departments):
        users_data = []
        counter    = 1

        # Get the current max employee number to avoid ID collisions
        last_emp = Employee.objects.order_by("-employee_id").first()
        if last_emp:
            try:
                emp_counter = int(last_emp.employee_id.split("-")[1]) + 1
            except (IndexError, ValueError):
                emp_counter = counter
        else:
            emp_counter = counter

        for role, count in ROLE_LAYOUT:
            for _ in range(count):
                n     = counter
                email = EMAIL_TEMPLATE.format(n=n)
                name  = f"LoadTest User {n:03d}"
                dept  = departments[(n - 1) % len(departments)]

                user = User.objects.create_user(
                    email=email,
                    password=PASSWORD,
                    full_name=name,
                    role=role,
                    is_active=True,
                )

                # Generate unique employee_id matching the app format
                emp_id = f"EMP-{emp_counter:04d}"
                emp_counter += 1

                Employee.objects.create(
                    user=user,
                    employee_id=emp_id,
                    full_name=name,
                    email=email,
                    phone=f"+91-900-000-{n:04d}",
                    department=dept,
                    role=JOB_TITLES[role],
                    status=Employee.Status.ACTIVE,
                    joining_date=datetime.date(2023, 1, 1),
                    salary=50000,
                )

                users_data.append({
                    "index":     n,
                    "email":     email,
                    "password":  PASSWORD,
                    "role":      role,
                    "user_id":   user.id,
                    "full_name": name,
                })
                counter += 1

        return users_data

    def _create_tasks(self, users_data, departments):
        employee_users = [u for u in users_data if u["role"] == User.Role.EMPLOYEE]
        manager_users  = [u for u in users_data if u["role"] in (
            User.Role.MANAGER, User.Role.ADMIN, User.Role.FOUNDER
        )]
        if not employee_users or not manager_users:
            return []

        statuses = [
            Task.Status.PENDING,
            Task.Status.IN_PROGRESS,
            Task.Status.COMPLETED,
            Task.Status.PENDING,
            Task.Status.IN_PROGRESS,
        ]
        task_ids = []

        for i in range(200):
            emp_data = employee_users[i % len(employee_users)]
            mgr_data = manager_users[i % len(manager_users)]
            dept     = departments[i % len(departments)]

            try:
                emp = Employee.objects.get(user_id=emp_data["user_id"])
                mgr = User.objects.get(id=mgr_data["user_id"])
            except (Employee.DoesNotExist, User.DoesNotExist):
                continue

            task_status = statuses[i % len(statuses)]
            progress    = (
                100 if task_status == Task.Status.COMPLETED
                else random.randint(10, 90) if task_status == Task.Status.IN_PROGRESS
                else 0
            )

            # Use next available task_id
            last_task = Task.objects.order_by("-task_id").first()
            if last_task and last_task.task_id:
                try:
                    next_num = int(last_task.task_id.split("-")[1]) + 1
                except (IndexError, ValueError):
                    next_num = Task.objects.count() + 1
            else:
                next_num = Task.objects.count() + 1

            task = Task.objects.create(
                task_id=f"TASK-{next_num:04d}",
                name=f"{TASK_NAMES[i % len(TASK_NAMES)]} #{i + 1}",
                description=f"Load test task #{i + 1} for performance testing.",
                assigned_to=emp,
                assigned_by=mgr,
                department=dept,
                priority=random.choice(list(Task.Priority)),
                status=task_status,
                start_date=datetime.date(2024, 1, 1),
                deadline=datetime.date(2025, 12, 31),
                progress=progress,
                expected_hours=random.randint(2, 16),
            )
            task_ids.append(task.id)

        return task_ids

    def _create_direct_conversations(self, users_data):
        """Create 20 DM conversations between adjacent employee pairs.
        Returns (conv_ids, chat_workers) where chat_workers maps each
        participant to their conversation id."""
        employees   = [u for u in users_data if u["role"] == User.Role.EMPLOYEE]
        conv_ids    = []
        chat_workers = []

        for i in range(0, min(40, len(employees) - 1), 2):
            try:
                u1 = User.objects.get(id=employees[i]["user_id"])
                u2 = User.objects.get(id=employees[i + 1]["user_id"])
                conv, _ = DirectConversation.get_or_create_between(u1, u2)
                conv_ids.append(conv.id)
                chat_workers.append({"email": employees[i]["email"],
                                     "password": PASSWORD, "conv_id": conv.id})
                chat_workers.append({"email": employees[i + 1]["email"],
                                     "password": PASSWORD, "conv_id": conv.id})
            except Exception as exc:
                self.stderr.write(f"  Warning: DM creation failed: {exc}")

        return conv_ids, chat_workers

    def _create_chat_groups(self, users_data):
        """Create 3 chat groups with ~30 employees each."""
        employees = [u for u in users_data if u["role"] == User.Role.EMPLOYEE]
        managers  = [u for u in users_data if u["role"] == User.Role.MANAGER]
        if not managers:
            return []

        creator = User.objects.get(id=managers[0]["user_id"])
        group_ids = []

        for i, g in enumerate(CHAT_GROUPS):
            group = ChatGroup.objects.create(
                name=g["name"],
                description=g["description"],
                created_by=creator,
            )
            GroupMembership.objects.create(group=group, user=creator, role="admin")

            start = (i * 30) % max(len(employees), 1)
            for j in range(30):
                idx = (start + j) % len(employees)
                try:
                    member = User.objects.get(id=employees[idx]["user_id"])
                    GroupMembership.objects.get_or_create(
                        group=group, user=member,
                        defaults={"role": "member"},
                    )
                except Exception:
                    pass

            group_ids.append(group.id)

        return group_ids

    def _regenerate_json(self):
        """Rebuild test_users.json from existing DB records without reseeding."""
        users_data = []
        for n in range(1, 101):
            email = EMAIL_TEMPLATE.format(n=n)
            try:
                user = User.objects.get(email=email)
                users_data.append({
                    "index":     n,
                    "email":     email,
                    "password":  PASSWORD,
                    "role":      user.role,
                    "user_id":   user.id,
                    "full_name": user.full_name,
                })
            except User.DoesNotExist:
                pass

        task_ids  = list(Task.objects.filter(
            name__contains="Load test task"
        ).values_list("id", flat=True))

        conv_ids  = list(DirectConversation.objects.values_list("id", flat=True)[:20])
        group_ids = list(ChatGroup.objects.filter(
            name__in=[g["name"] for g in CHAT_GROUPS]
        ).values_list("id", flat=True))

        output = {
            "users":            users_data,
            "task_ids":         task_ids,
            "conversation_ids": conv_ids,
            "group_ids":        group_ids,
        }
        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(OUTPUT_PATH, "w") as f:
            json.dump(output, f, indent=2)

        self.stdout.write(self.style.SUCCESS(f"JSON regenerated at {OUTPUT_PATH}"))
