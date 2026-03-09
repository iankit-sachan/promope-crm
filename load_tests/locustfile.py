"""
Locust load test for Staff Management CRM.

Simulates 100 concurrent users (70 employees, 20 managers, 10 HR) performing
realistic daily operations against the Django REST API.

Run headless:
    locust -f locustfile.py --headless \\
        --host=http://localhost:8000 \\
        -u 100 -r 10 --run-time 5m \\
        --csv=locust_stats --html=locust_report.html

Prerequisites:
    pip install locust>=2.20.0
    python manage.py seed_load_test_data   # creates test_users.json
"""

import json
import random
from pathlib import Path

from locust import HttpUser, task, between
from locust.exception import StopUser

# ---------------------------------------------------------------------------
# Test data loader
# ---------------------------------------------------------------------------
_DATA_FILE  = Path(__file__).parent / "test_users.json"
_test_data  = None


def _load_data():
    global _test_data
    if _test_data is None:
        if not _DATA_FILE.exists():
            raise FileNotFoundError(
                f"test_users.json not found at {_DATA_FILE}.\n"
                "Run:  cd backend && python manage.py seed_load_test_data"
            )
        with open(_DATA_FILE) as f:
            _test_data = json.load(f)
    return _test_data


def _pick_user(role=None):
    data = _load_data()
    pool = data["users"] if role is None else [u for u in data["users"] if u["role"] == role]
    if not pool:
        raise ValueError(f"No users found for role={role!r}")
    return random.choice(pool)


# ---------------------------------------------------------------------------
# Chat message bank
# ---------------------------------------------------------------------------
_MESSAGES = [
    "Hey, any updates on the task?",
    "I've pushed the latest changes — please review.",
    "Can someone help with this issue?",
    "Deployment done, monitoring now.",
    "Stand-up in 5 minutes.",
    "PR is up for review.",
    "Need clarification on the requirements.",
    "Build is passing now.",
]

_PAGES = [
    ("/dashboard",  "Dashboard"),
    ("/tasks",      "Tasks"),
    ("/chat",       "Chat"),
    ("/worklogs",   "Work Logs"),
    ("/my-attendance", "My Attendance"),
]

# ---------------------------------------------------------------------------
# Base user class — handles auth lifecycle + auto-token-refresh
# ---------------------------------------------------------------------------

class CRMUser(HttpUser):
    abstract = True

    # Set by subclasses
    _role = None

    # State filled by on_start
    access_token  = None
    refresh_token = None
    user_id       = None
    _task_ids     = []
    _conv_ids     = []
    _group_ids    = []

    def on_start(self):
        creds = _pick_user(role=self._role)
        self._email    = creds["email"]
        self._password = creds["password"]
        self._do_login()

        data = _load_data()
        self._task_ids = data.get("task_ids", [])
        self._conv_ids = data.get("conversation_ids", [])
        self._group_ids = data.get("group_ids", [])

    def on_stop(self):
        if self.refresh_token:
            self._do_logout()

    # ------------------------------------------------------------------ auth

    def _do_login(self):
        with self.client.post(
            "/api/auth/login/",
            json={"email": self._email, "password": self._password},
            catch_response=True,
            name="POST /api/auth/login/",
        ) as r:
            if r.status_code == 200:
                body = r.json()
                self.access_token  = body["access"]
                self.refresh_token = body["refresh"]
                self.user_id       = body["user"]["id"]
                r.success()
            else:
                r.failure(f"Login failed {r.status_code}: {r.text[:200]}")
                raise StopUser()

    def _do_logout(self):
        self.client.post(
            "/api/auth/logout/",
            json={"refresh": self.refresh_token},
            headers=self._headers(),
            name="POST /api/auth/logout/",
        )

    def _refresh_token(self):
        r = self.client.post(
            "/api/auth/token/refresh/",
            json={"refresh": self.refresh_token},
            name="POST /api/auth/token/refresh/",
        )
        if r.status_code == 200:
            body = r.json()
            self.access_token  = body.get("access", self.access_token)
            self.refresh_token = body.get("refresh", self.refresh_token)
            return True
        return False

    def _headers(self):
        return {"Authorization": f"Bearer {self.access_token}"}

    # ------------------------------------------------------------------ request wrapper

    def _req(self, method, path, name=None, **kwargs):
        """
        Authenticated request with auto token-refresh on 401.
        - 400/403/404  → marked success (expected in load tests)
        - 5xx          → marked failure
        - 401 + refresh fails → StopUser
        """
        kwargs.setdefault("headers", {}).update(self._headers())
        kwargs["name"]           = name or path
        kwargs["catch_response"] = True

        fn = getattr(self.client, method.lower())
        with fn(path, **kwargs) as r:
            if r.status_code == 401:
                if self._refresh_token():
                    kwargs["headers"].update(self._headers())
                    r.success()
                    with fn(path, **kwargs) as r2:
                        if r2.status_code >= 500:
                            r2.failure(f"5xx after token refresh: {r2.status_code}")
                        else:
                            r2.success()
                        return r2
                else:
                    r.failure("Token refresh failed")
                    raise StopUser()
            elif r.status_code >= 500:
                r.failure(f"Server error: {r.status_code}")
            else:
                r.success()
            return r

    # ------------------------------------------------------------------ helpers

    def _tid(self):
        return random.choice(self._task_ids) if self._task_ids else None

    def _cid(self):
        return random.choice(self._conv_ids) if self._conv_ids else None


# ---------------------------------------------------------------------------
# Employee — 70% of users (weight=7)
# ---------------------------------------------------------------------------

class EmployeeUser(CRMUser):
    """
    Simulates a typical employee: tasks, attendance, chat, worklogs.
    Note: /api/analytics/dashboard/ is IsManagerOrAbove — employees cannot call it.
    """
    weight    = 7
    wait_time = between(1, 5)
    _role     = "employee"

    @task(10)
    def list_tasks(self):
        self._req("get", "/api/tasks/", name="GET /api/tasks/")

    @task(6)
    def unread_count(self):
        self._req("get", "/api/notifications/unread-count/",
                  name="GET /api/notifications/unread-count/")

    @task(5)
    def log_page_visit(self):
        page, title = random.choice(_PAGES)
        self._req("post", "/api/activity/log-visit/",
                  name="POST /api/activity/log-visit/",
                  json={"page": page, "page_title": title})

    @task(5)
    def update_status(self):
        self._req("patch", "/api/activity/update-status/",
                  name="PATCH /api/activity/update-status/",
                  json={"status": random.choice(["online", "away", "idle"])})

    @task(4)
    def update_task_progress(self):
        tid = self._tid()
        if not tid:
            return
        self._req("patch", f"/api/tasks/{tid}/progress/",
                  name="PATCH /api/tasks/{id}/progress/",
                  json={"progress": random.randint(10, 95)})

    @task(3)
    def checkin(self):
        self._req("post", "/api/attendance/checkin/",
                  name="POST /api/attendance/checkin/", json={})

    @task(3)
    def submit_worklog(self):
        self._req("post", "/api/worklogs/",
                  name="POST /api/worklogs/",
                  json={
                      "work_description": "Worked on load test tasks",
                      "hours_worked":     round(random.uniform(1.0, 8.0), 1),
                      "status":           "submitted",
                  })

    @task(3)
    def send_direct_message(self):
        cid = self._cid()
        if not cid:
            return
        self._req("post", f"/api/chat/conversations/{cid}/send/",
                  name="POST /api/chat/conversations/{id}/send/",
                  json={"content": random.choice(_MESSAGES)})

    @task(2)
    def list_worklogs(self):
        self._req("get", "/api/worklogs/", name="GET /api/worklogs/")

    @task(2)
    def attendance_today(self):
        self._req("get", "/api/attendance/today/",
                  name="GET /api/attendance/today/")

    @task(1)
    def checkout(self):
        self._req("post", "/api/attendance/checkout/",
                  name="POST /api/attendance/checkout/", json={})

    @task(1)
    def list_notifications(self):
        self._req("get", "/api/notifications/",
                  name="GET /api/notifications/")


# ---------------------------------------------------------------------------
# Manager — 20% of users (weight=2)
# ---------------------------------------------------------------------------

class ManagerUser(CRMUser):
    """
    Simulates a manager: dashboard, employee oversight, task management, analytics.
    Hits IsManagerOrAbove endpoints including the N+1 presence view.
    """
    weight    = 2
    wait_time = between(0.5, 2)
    _role     = "manager"

    @task(10)
    def analytics_dashboard(self):
        self._req("get", "/api/analytics/dashboard/",
                  name="GET /api/analytics/dashboard/")

    @task(8)
    def list_employees(self):
        self._req("get", "/api/employees/", name="GET /api/employees/")

    @task(6)
    def list_all_tasks(self):
        self._req("get", "/api/tasks/", name="GET /api/tasks/ [mgr]")

    @task(4)
    def update_task_status(self):
        tid = self._tid()
        if not tid:
            return
        self._req("patch", f"/api/tasks/{tid}/",
                  name="PATCH /api/tasks/{id}/ [mgr]",
                  json={"status": random.choice(["in_progress", "pending"])})

    @task(4)
    def admin_attendance(self):
        self._req("get", "/api/attendance/",
                  name="GET /api/attendance/ [admin view]")

    @task(3)
    def activity_feed(self):
        self._req("get", "/api/activity/", name="GET /api/activity/")

    @task(3)
    def employee_productivity(self):
        self._req("get", "/api/analytics/employee-productivity/",
                  name="GET /api/analytics/employee-productivity/")

    @task(2)
    def daily_report(self):
        self._req("get", "/api/reports/daily/", name="GET /api/reports/daily/")

    @task(2)
    def tasks_by_department(self):
        self._req("get", "/api/analytics/tasks-by-department/",
                  name="GET /api/analytics/tasks-by-department/")

    @task(1)
    def presence_dashboard(self):
        # ⚠ N+1 risk endpoint — key metric to monitor
        self._req("get", "/api/attendance/presence/",
                  name="GET /api/attendance/presence/ [N+1 risk]")

    @task(1)
    def unread_count(self):
        self._req("get", "/api/notifications/unread-count/",
                  name="GET /api/notifications/unread-count/ [mgr]")


# ---------------------------------------------------------------------------
# HR — 10% of users (weight=1)
# ---------------------------------------------------------------------------

class HRUser(CRMUser):
    """
    Simulates an HR specialist: leave management, payroll, attendance reporting.
    """
    weight    = 1
    wait_time = between(1, 3)
    _role     = "hr"

    @task(8)
    def hr_dashboard(self):
        self._req("get", "/api/hr/dashboard/", name="GET /api/hr/dashboard/")

    @task(6)
    def list_leave_requests(self):
        self._req("get", "/api/hr/leave/", name="GET /api/hr/leave/")

    @task(4)
    def hr_attendance(self):
        self._req("get", "/api/hr/attendance/", name="GET /api/hr/attendance/")

    @task(3)
    def attendance_daily_report(self):
        self._req("get", "/api/attendance/reports/daily/",
                  name="GET /api/attendance/reports/daily/")

    @task(3)
    def leave_balances(self):
        self._req("get", "/api/hr/leave/balances/",
                  name="GET /api/hr/leave/balances/")

    @task(2)
    def hr_reports(self):
        self._req("get", "/api/hr/reports/", name="GET /api/hr/reports/")

    @task(2)
    def payroll_dashboard(self):
        self._req("get", "/api/hr/payroll/", name="GET /api/hr/payroll/")

    @task(1)
    def unread_count(self):
        self._req("get", "/api/notifications/unread-count/",
                  name="GET /api/notifications/unread-count/ [hr]")

    @task(1)
    def list_employees(self):
        self._req("get", "/api/employees/", name="GET /api/employees/ [hr]")
