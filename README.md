# Staff Management CRM — Command Center

A full-stack **Staff Management CRM** built with **React 18 + Django 4.2** featuring role-based dashboards, real-time activity feeds, task management, attendance tracking, integrated chat, live presence detection, and analytics — all in a dark-theme SaaS UI.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Architecture Overview](#architecture-overview)
3. [Project Structure](#project-structure)
4. [Technical Concepts](#technical-concepts)
   - [Authentication & JWT](#1-authentication--jwt)
   - [Role-Based Access Control](#2-role-based-access-control-rbac)
   - [Custom Auth Backend & Presence Tracking](#3-custom-auth-backend--presence-tracking)
   - [Real-Time with Django Channels](#4-real-time-with-django-channels--websockets)
   - [Database Design](#5-database-design)
   - [REST API Design](#6-rest-api-design-django-rest-framework)
   - [Frontend State Management](#7-frontend-state-management)
   - [Role-Aware Dashboard Rendering](#8-role-aware-dashboard-rendering)
   - [Attendance & Time Tracking](#9-attendance--time-tracking)
   - [Chat System](#10-chat-system)
     - [Chat Popup Widget](#chat-popup-widget)
   - [Activity Logging](#11-activity-logging)
   - [Notifications](#12-notifications)
   - [Analytics Engine](#13-analytics-engine)
   - [Task Management System](#14-task-management-system)
   - [Department Management](#15-department-management)
   - [Daily Reports](#16-daily-reports)
   - [HR Module](#17-hr-module)
   - [Time Tracking](#18-time-tracking)
5. [API Reference](#api-reference)
6. [WebSocket Events](#websocket-events)
7. [Role Permissions Matrix](#role-permissions-matrix)
8. [Database Schema](#database-schema)
9. [Quick Start](#quick-start)
10. [Environment Variables](#environment-variables)
11. [Development Notes](#development-notes)
12. [Testing](#testing)
13. [Deployment](#deployment)
14. [Android Mobile App](#android-mobile-app)

---

## Tech Stack

| Layer         | Technology                                    | Purpose                                      |
|---------------|-----------------------------------------------|----------------------------------------------|
| **Frontend**  | React 18, Vite 5                              | UI framework + fast HMR dev server           |
| **Styling**   | Tailwind CSS 3                                | Utility-first CSS, dark theme                |
| **Backend**   | Django 4.2, Django REST Framework             | REST API + business logic                    |
| **Real-time** | Django Channels 4, Redis 7                    | WebSocket consumers for live feeds           |
| **ASGI**      | Daphne                                        | ASGI server for HTTP + WebSocket             |
| **Database**  | PostgreSQL 14+                                | Primary relational database                  |
| **Auth**      | SimpleJWT + Custom Backend                    | JWT tokens + HTTP presence tracking          |
| **Charts**    | Recharts                                      | Line, Bar, Pie charts in React               |
| **State**     | Zustand + React Query (@tanstack)             | Global store + server state / caching        |
| **HTTP**      | Axios                                         | API client with JWT refresh interceptor      |
| **Icons**     | Lucide React                                  | SVG icon library                             |
| **Toasts**    | react-hot-toast                               | User feedback notifications                  |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    BROWSER (React 18)                    │
│  ┌──────────┐  ┌───────────┐  ┌────────────────────┐   │
│  │ Zustand  │  │React Query│  │  WebSocket Client  │   │
│  │Auth Store│  │Server Cache│  │  (useWebSocket.js) │   │
│  └──────────┘  └───────────┘  └────────────────────┘   │
│          │              │               │               │
│          └──────────────┼───────────────┘               │
│                    Axios (+ JWT interceptor)             │
└──────────────────────────┬──────────────────────────────┘
                           │  HTTP/WS (via Vite proxy)
┌──────────────────────────▼──────────────────────────────┐
│                    Daphne (ASGI)                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Django ASGI Router                 │    │
│  │   HTTP → Django Middleware Stack → DRF Views    │    │
│  │   WS   → Django Channels → Consumers           │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐    │
│  │  DRF APIs   │  │  Consumers   │  │ Activity Log│    │
│  │  (ViewSets) │  │ (async/await)│  │  Broadcaster│    │
│  └─────────────┘  └──────────────┘  └─────────────┘    │
└────────────┬────────────────┬────────────────────────────┘
             │                │
   ┌─────────▼────┐   ┌───────▼───────┐
   │  PostgreSQL  │   │  Redis 7      │
   │  (models)    │   │  Channel Layer│
   └──────────────┘   └───────────────┘
```

---

## Project Structure

```
CRM/
├── backend/
│   ├── config/
│   │   ├── settings.py          # Django settings (TIME_ZONE, DRF, JWT, CORS)
│   │   ├── urls.py              # Root URL configuration
│   │   └── asgi.py              # ASGI app: HTTP + WebSocket routing
│   │
│   ├── apps/
│   │   ├── authentication/
│   │   │   ├── models.py        # Custom User model (extends AbstractBaseUser)
│   │   │   ├── backends.py      # OnlineTrackingJWTAuthentication
│   │   │   ├── views.py         # login_view, logout_view, profile
│   │   │   ├── serializers.py   # UserSerializer, LoginSerializer
│   │   │   └── permissions.py   # IsManagerOrAbove, IsFounderOrAdmin, etc.
│   │   │
│   │   ├── employees/
│   │   │   ├── models.py        # Employee (OneToOne → User)
│   │   │   ├── views.py         # EmployeeViewSet, active-today endpoint
│   │   │   └── serializers.py   # EmployeeSerializer (nested)
│   │   │
│   │   ├── tasks/
│   │   │   ├── models.py        # Task, TaskComment, TaskAttachment, TaskHistory
│   │   │   ├── views.py         # TaskViewSet with role-filtered queryset
│   │   │   └── serializers.py   # TaskSerializer with history tracking
│   │   │
│   │   ├── departments/
│   │   │   ├── models.py        # Department (with head, color)
│   │   │   └── views.py         # DepartmentViewSet
│   │   │
│   │   ├── attendance/
│   │   │   ├── models.py        # AttendanceLog, UserPresence
│   │   │   ├── views.py         # check-in, check-out, today, presence dashboard
│   │   │   └── consumers.py     # PresenceConsumer (WebSocket)
│   │   │
│   │   ├── activity/
│   │   │   ├── models.py        # ActivityLog
│   │   │   ├── utils.py         # log_activity() — logs + broadcasts to WS
│   │   │   ├── consumers.py     # ActivityConsumer (WebSocket)
│   │   │   └── routing.py       # WS URL patterns
│   │   │
│   │   ├── notifications/
│   │   │   ├── models.py        # Notification (per-user, with priority)
│   │   │   └── views.py         # list, unread-count, mark-read
│   │   │
│   │   ├── analytics/
│   │   │   └── views.py         # dashboard KPIs, tasks-over-time, by-dept, by-priority
│   │   │
│   │   ├── chat/
│   │   │   ├── models.py        # DirectConversation, ChatGroup, GroupMembership,
│   │   │   │                    # Message, MessageReadReceipt, PdfReport
│   │   │   ├── views.py         # conversation & group REST endpoints
│   │   │   └── consumers.py     # ChatConsumer ws/chat/<type>/<id>/
│   │   │
│   │   ├── worklogs/
│   │       │   ├── models.py        # WorkLog (daily employee submission)
│   │       │   └── views.py         # submit, approve, list
│   │
│   ├── daily_reports/
│   │   ├── models.py        # DailyReport (draft→submitted→reviewed)
│   │   ├── views.py         # list, my-reports, all, analytics, submit, review
│   │   └── serializers.py   # DailyReportSerializer with analytics
│   │
│   ├── hr/
│   │   ├── models.py        # Leave, HRDocument, Salary, BankDetails,
│   │   │                    # Payslip, JobPosition, Candidate, HRTask
│   │   └── views.py         # dashboard, leaves, payroll, recruitment, hiring
│   │
│   ├── tracking/
│   │   ├── models.py        # DailyReport (tracking), TaskTimer
│   │   └── views.py         # reports, timers, productivity dashboard
│   │
│   └── remote_control/
│       └── views.py         # Remote agent control API
│
├── manage.py
├── test_integration.py      # Integration test suite (8 test groups)
└── requirements.txt
│   └── requirements.txt
│
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── common/
    │   │   │   ├── Layout.jsx          # App shell: Sidebar + TopBar + main outlet
    │   │   │   ├── Sidebar.jsx         # Role-filtered navigation links
    │   │   │   ├── TopBar.jsx          # Search, notification bell, date display
    │   │   │   ├── StatCard.jsx        # Reusable KPI card
    │   │   │   ├── ProgressBar.jsx     # Animated progress bar
    │   │   │   └── LoadingSpinner.jsx  # Centered loader
    │   │   └── dashboard/
    │   │       ├── LiveActivityFeed.jsx      # Real-time event stream
    │   │       ├── TaskMonitoringTable.jsx   # Task list with status
    │   │       └── EmployeeActivityTable.jsx # Employee online/offline list
    │   │
    │   ├── pages/
    │   │   ├── LoginPage.jsx          # JWT login form
    │   │   ├── DashboardPage.jsx      # Role-router → AdminDashboard / EmployeeDashboard
    │   │   ├── EmployeesPage.jsx      # Employee directory + search/filter
    │   │   ├── EmployeeProfilePage.jsx # Full profile + activity timeline
    │   │   ├── TasksPage.jsx          # Task list with filters
    │   │   ├── TaskDetailPage.jsx     # Task detail + comments + history
    │   │   ├── AddTaskPage.jsx        # Create task form
    │   │   ├── DepartmentsPage.jsx    # Department cards + modal CRUD
    │   │   ├── AnalyticsPage.jsx      # Charts + KPI summary
    │   │   ├── AttendancePage.jsx     # Attendance Monitor (manager+)
    │   │   ├── MyAttendancePage.jsx   # Personal attendance + check-in/out
    │   │   ├── WorkLogPage.jsx        # Daily work log submission
    │   │   ├── ChatPage.jsx           # Messaging: Direct + Groups + Reports
    │   │   ├── ManagerDashboardPage.jsx # Daily team productivity view
    │   │   ├── DailyReportPage.jsx    # Employee daily report submission + review
    │   │   ├── ActivityLogsPage.jsx   # Full activity log browser (manager+)
    │   │   ├── ActivityMonitorDashboard.jsx # Live activity monitor
    │   │   ├── AddEmployeePage.jsx    # Add new employee form
    │   │   ├── RoleManagementPage.jsx # Role assignment and management
    │   │   ├── TimeTrackingPage.jsx   # Task timer + productivity tracking
    │   │   ├── RemoteControlPage.jsx  # Remote agent control panel
    │   │   ├── ReportsPage.jsx        # Work log reports (daily/weekly/monthly)
    │   │   └── SettingsPage.jsx       # Profile + password settings
    │   │
    │   ├── store/
    │   │   ├── authStore.js       # Zustand: user, tokens, persist to localStorage
    │   │   ├── activityStore.js   # Zustand: live activity feed events
    │   │   ├── chatStore.js       # Zustand: conversations, groups, active chat
    │   │   └── presenceStore.js   # Zustand: employee online/offline map
    │   │
    │   ├── hooks/
    │   │   ├── useWebSocket.js    # Generic WS hook with reconnect logic
    │   │   ├── useChat.js         # Chat WS + polling integration
    │   │   ├── usePresence.js     # HTTP-polled presence data
    │   │   └── useOnlineStatus.js # Per-user online status lookup
    │   │
    │   ├── services/
    │   │   └── api.js             # Axios instance + all service modules + JWT interceptor
    │   │
    │   └── utils/
    │       └── helpers.js         # timeAgo(), formatDate(), formatCurrency(), etc.
    │
    ├── vite.config.js             # Vite proxy: /api → :8000, /ws → :8000
    └── tailwind.config.js         # Dark slate theme tokens
```

**Additional project folders:**

```
deploy/
├── promope-crm.service            # systemd unit file
├── nginx.conf                     # Nginx reverse proxy config
└── run_deploy.sh                  # One-command EC2 full deployment script

android-wrapper-app/               # Native Android APK (WebView wrapper)
└── app/src/main/kotlin/com/promope/app/
    ├── MainActivity.kt            # WebView + JWT injection + deep-link
    ├── ChatBridge.kt              # JS<->Native bridge (window.Android.*)
    ├── NotificationHelper.kt      # Notification channels + badge
    └── ChatNotificationService.kt # ForegroundService, 30s REST poll
```

---

## Technical Concepts

### 1. Authentication & JWT

The system uses **JSON Web Tokens (JWT)** via `djangorestframework-simplejwt`.

**Flow:**
1. User POSTs credentials to `/api/auth/login/`
2. Django validates password, returns `access` (60 min) + `refresh` (7 days) tokens
3. Frontend stores tokens in Zustand (persisted to `localStorage` under key `crm-auth`)
4. Every API request attaches `Authorization: Bearer <access_token>` header
5. When access token expires, Axios interceptor auto-calls `/api/auth/token/refresh/` with the refresh token, then retries the original request
6. On logout, Django blacklists the refresh token so it cannot be reused

**Frontend — JWT Interceptor** (`src/services/api.js`):
```js
// Response interceptor — handles 401 by refreshing token
api.interceptors.response.use(null, async (error) => {
  if (error.response?.status === 401 && !originalRequest._retry) {
    originalRequest._retry = true
    const { refresh } = useAuthStore.getState()
    const { data } = await axios.post('/api/auth/token/refresh/', { refresh })
    useAuthStore.getState().setTokens(data.access, refresh)
    return api(originalRequest)
  }
  return Promise.reject(error)
})
```

**Backend — Token Blacklisting:**
```python
# settings.py
INSTALLED_APPS = ['rest_framework_simplejwt.token_blacklist', ...]

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
}
```

---

### 2. Role-Based Access Control (RBAC)

Four user roles with hierarchical permissions:

```
Founder > Admin > Manager > Employee
```

**Backend Permission Classes** (`apps/authentication/permissions.py`):
```python
class IsManagerOrAbove(BasePermission):
    def has_permission(self, request, view):
        return request.user.role in ['founder', 'admin', 'manager']

class IsFounderOrAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.role in ['founder', 'admin']
```

**Task Queryset Filtering** — Employees only see their own tasks:
```python
class TaskViewSet(ModelViewSet):
    def get_queryset(self):
        user = self.request.user
        qs = Task.objects.select_related('assigned_to', 'department')
        if user.role == 'employee':
            return qs.filter(assigned_to__user=user)  # own tasks only
        return qs  # managers+ see all
```

**Frontend — Role-Filtered Sidebar** (`Sidebar.jsx`):
```jsx
const navItems = [
  { href: '/dashboard', label: 'Dashboard', roles: ['founder','admin','manager','employee'] },
  { href: '/employees', label: 'Employees',  roles: ['founder','admin','manager'] },
  { href: '/analytics', label: 'Analytics',  roles: ['founder','admin','manager'] },
  { href: '/worklogs',  label: 'Work Log',   roles: ['employee','manager'] },
  // ...
].filter(item => item.roles.includes(user?.role))
```

---

### 3. Custom Auth Backend & Presence Tracking

A custom DRF authentication backend (`OnlineTrackingJWTAuthentication`) extends the standard JWT backend to update the user's **online presence on every API request** — making presence work without WebSocket/Redis.

**Key idea:** Every authenticated HTTP request is a proof-of-life signal.

```python
# apps/authentication/backends.py
class OnlineTrackingJWTAuthentication(JWTAuthentication):
    UPDATE_INTERVAL = 60  # seconds — throttle DB writes

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None
        user, validated_token = result
        self._touch_presence(user)       # side-effect: mark online
        return user, validated_token

    def _touch_presence(self, user):
        now = timezone.now()
        # Skip if updated within throttle window
        if (user.is_online
                and user.last_seen
                and (now - user.last_seen).total_seconds() < self.UPDATE_INTERVAL):
            return
        # Update User model
        user.is_online = True
        user.last_seen = now
        user.save(update_fields=['is_online', 'last_seen'])
        # Sync UserPresence table
        presence, _ = UserPresence.objects.get_or_create(user=user)
        presence.status = 'online'
        presence.last_active = now
        presence.save(update_fields=['status', 'last_active'])
```

**Presence Truth Source Priority:**
1. `User.is_online` (set by `_touch_presence` via HTTP) — primary
2. `UserPresence.status` (set by WebSocket `PresenceConsumer`) — secondary
3. Fallback: `User.last_seen` field

**Graceful Degradation:** When Redis/WebSocket is unavailable, presence still works via HTTP polling. The `presence_dashboard_view` merges both sources:
```python
status = 'online' if user.is_online else getattr(user.presence, 'status', 'offline')
```

---

### 4. Real-Time with Django Channels & WebSockets

**ASGI Configuration** (`config/asgi.py`):
```python
application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": AuthMiddlewareStack(
        URLRouter([
            path("ws/activity/",          ActivityConsumer.as_asgi()),
            path("ws/notifications/",     NotificationConsumer.as_asgi()),
            path("ws/attendance/",        PresenceConsumer.as_asgi()),
            path("ws/chat/<str:room_type>/<int:room_id>/", ChatConsumer.as_asgi()),
        ])
    ),
})
```

**Channel Layer** (Redis-backed group messaging):
```python
# settings.py
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {"hosts": [("127.0.0.1", 6379)]},
    }
}
```

**Activity Broadcasting** — `log_activity()` utility writes to DB and broadcasts to WS in one call:
```python
# apps/activity/utils.py
def log_activity(actor, verb, description, **kwargs):
    log = ActivityLog.objects.create(actor=actor, verb=verb, ...)
    # Broadcast to all managers+ via channel group
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        "activity_feed",
        {"type": "activity.update", "data": ActivityLogSerializer(log).data}
    )
    return log
```

**WS Group Naming Convention:**
| Group Name              | Who Subscribes          | What Gets Sent               |
|-------------------------|-------------------------|------------------------------|
| `activity_feed`         | All managers+           | Every `log_activity()` call  |
| `notifications_{user_id}` | Individual user       | New notification events      |
| `presence`              | All connected users     | Online/offline status changes|
| `chat_direct_{conv_id}` | Conversation members    | New messages                 |
| `chat_group_{group_id}` | Group members           | New messages                 |

**Frontend WS Hook** (`src/hooks/useWebSocket.js`):
```js
// Connects via Vite proxy ws://localhost:5173/ws/activity/
// Auto-reconnects on disconnect with exponential backoff
// Sends { type: 'authenticate', token: accessToken } on connect
```

---

### 5. Database Design

**Key Design Decisions:**

**Auto-Generated IDs:**
- `employee_id` → `EMP-0001`, `EMP-0002`, ... (sequential, padded to 4 digits)
- `task_id` → `TASK-0001`, `TASK-0002`, ... (sequential, padded to 4 digits)

```python
# Generated in model's save() method:
def save(self, *args, **kwargs):
    if not self.task_id:
        last = Task.objects.order_by('-id').first()
        n = (last.id if last else 0) + 1
        self.task_id = f'TASK-{n:04d}'
    super().save(*args, **kwargs)
```

**OneToOne Relationship — User ↔ Employee:**
```python
class Employee(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='employee')
    # Allows: employee.user and user.employee reverse access
```

**Soft Delete via Status:**
- Employees use `status = active/inactive/terminated` rather than hard deletes
- Tasks use `status = pending/in_progress/completed/delayed/cancelled`

**IST Timezone:**
```python
# settings.py
TIME_ZONE = 'Asia/Kolkata'   # UTC+5:30
USE_TZ = True                 # All datetimes stored in UTC internally
# timezone.localtime() converts to IST for display
```

---

### 6. REST API Design (Django REST Framework)

**Standard DRF Patterns Used:**

- **ModelViewSet** — Full CRUD with automatic URL routing via `DefaultRouter`
- **Pagination** — `PageNumberPagination` (default page_size=20)
- **Filtering** — `django-filter` with `SearchFilter` and `OrderingFilter`
- **Serializer Nesting** — Employee serializer nests User data; Task serializer nests assigned Employee
- **`select_related` / `prefetch_related`** — Used on all list endpoints to prevent N+1 queries

**Custom Pagination Response (Chat):**
```python
# ChatGroupListCreate uses ListCreateAPIView → paginated response
# Response shape: { count: N, results: [...] }
# Frontend normalizes: Array.isArray(d) ? d : d?.results ?? []
```

**Queryset Optimization Example:**
```python
class EmployeeViewSet(ModelViewSet):
    queryset = Employee.objects.select_related(
        'user', 'department'
    ).prefetch_related(
        'tasks', 'user__presence'
    ).annotate(
        task_count=Count('tasks'),
        completed_count=Count('tasks', filter=Q(tasks__status='completed'))
    )
```

**Productivity Score Calculation:**
```python
# Computed property on Employee model
@property
def productivity_score(self):
    total = self.tasks.count()
    if total == 0:
        return 0
    completed = self.tasks.filter(status='completed').count()
    return round((completed / total) * 100, 1)
```

---

### 7. Frontend State Management

**Two-Layer State Architecture:**

| Layer | Tool | Persisted? | Use Case |
|-------|------|-----------|----------|
| **Server State** | React Query | In-memory cache | API data, auto-refetch |
| **Client State** | Zustand | localStorage (auth) | Auth, UI state, WS data |

**Zustand Auth Store** (`src/store/authStore.js`):
```js
const useAuthStore = create(persist(
  (set) => ({
    user: null,
    access: null,
    refresh: null,
    setAuth: (user, access, refresh) => set({ user, access, refresh }),
    logout: () => set({ user: null, access: null, refresh: null }),
  }),
  { name: 'crm-auth' }  // persists to localStorage
))
```

**React Query Configuration:**
```js
// Stale time: 30 seconds for most queries
// Retry: 1 time on failure
// Background refetch: on window focus
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 }
  }
})
```

**WS + React Query Integration (Chat):**
- WebSocket pushes new messages → updates Zustand chat store
- When WS unavailable (no Redis), React Query polls every 3 seconds as fallback
- Ensures chat works in all environments

---

### 8. Role-Aware Dashboard Rendering

The `DashboardPage` conditionally renders entirely different components based on role:

```jsx
// src/pages/DashboardPage.jsx
export default function DashboardPage() {
  const { user } = useAuthStore()

  if (user?.role === 'employee') {
    return <EmployeeDashboard user={user} />
  }
  return <AdminDashboard user={user} />
}
```

**EmployeeDashboard** — APIs used:
- `/api/tasks/` — auto-filtered to own tasks (role filter on backend)
- `/api/attendance/today/` — today's personal attendance record
- No analytics APIs → no 403 errors

**AdminDashboard** — APIs used:
- `/api/analytics/dashboard/` — KPI summary
- `/api/analytics/tasks-over-time/?days=14` — line chart
- `/api/analytics/tasks-by-department/` — bar chart
- `/api/analytics/tasks-by-priority/` — distribution
- `/api/employees/?page_size=50` — employee online status list

---

### 9. Attendance & Time Tracking

**AttendanceLog Model:**
```python
class AttendanceLog(models.Model):
    employee    = ForeignKey(Employee, ...)
    date        = DateField(default=date.today)
    check_in    = DateTimeField(null=True)
    check_out   = DateTimeField(null=True)
    total_hours = DecimalField(max_digits=4, decimal_places=2, null=True)
    status      = CharField(choices=['present','absent','half_day','late'])
    notes       = TextField(blank=True)
```

**Auto-Status Calculation on Check-Out:**
```python
def checkout(self):
    self.check_out = timezone.now()
    hours = (self.check_out - self.check_in).total_seconds() / 3600
    self.total_hours = round(hours, 2)
    if hours >= 8:
        self.status = 'present'
    elif hours >= 4:
        self.status = 'half_day'
    else:
        self.status = 'late'
    self.save()
```

**UserPresence Model** (real-time online state):
```python
class UserPresence(models.Model):
    user          = OneToOneField(User, related_name='presence')
    status        = CharField(choices=['online','away','offline'], default='offline')
    last_active   = DateTimeField(auto_now=True)
    session_start = DateTimeField(null=True)
```

**Presence Dashboard Endpoint** — merges two presence sources:
```python
# User.is_online (HTTP-based) takes priority
# Falls back to UserPresence.status (WS-based)
# last_seen displayed as "just now / X min ago / X hr ago"
```

---

### 10. Chat System

**Models:**

```
DirectConversation  — 1-to-1 chat between two users
ChatGroup           — Group chat with name, avatar, admin
GroupMembership     — M2M: user ↔ group with role (admin/member)
Message             — Content, sender, conversation/group FK, file attachment
MessageReadReceipt  — Tracks who has read which message
PdfReport           — Employee submits PDF; manager approves/rejects
```

**WebSocket Room Naming:**
```
ws/chat/direct/{conversation_id}/?token=<jwt>   → DirectConversation
ws/chat/group/{group_id}/?token=<jwt>           → ChatGroup
```
JWT auth is passed as a query param (`?token=`). Unauthenticated connections are closed with code `4001`.

**Message Flow:**
1. User types → `ChatPopup`/`ChatPage` sends via REST `POST /api/chat/conversations/{id}/send/`
2. View saves `Message` to DB → calls `_broadcast_message()` → `channel_layer.group_send` to WS room
3. `ChatConsumer` broadcasts `{ type: 'message', ... }` to all room members
4. `useChat.js` receives event → `chatStore.addMessage()` → React re-renders
5. On connect: consumer sends last 60 messages as `{ type: 'history', messages: [...] }` → `chatStore.setMessages()`

**Optimistic Send (ChatPopup):**
```js
// onMutate: insert temp entry immediately for instant feedback
addMessage(roomKey, { id: `temp_${Date.now()}`, content, sender_id, ... })
// onSuccess: swap temp with confirmed server message (no duplicate)
replaceTempMessage(roomKey, tempId, serverMessage)
// onError: roll back the temp entry
removeMessage(roomKey, tempId)
```

**REST Polling Fallback:**
```
Messages:      refetchInterval: 5_000   (5 s)   — catches missed WS events
Conversations: refetchInterval: 30_000  (30 s)  — unread counts + new DMs
```

**Role-Based DM Permissions (`GET /api/chat/users/`):**
| Caller Role | Users returned |
|-------------|----------------|
| `employee`  | HR, Manager, Admin, Founder only |
| All others  | Everyone (all active users except self) |

**chatStore.js Key Actions:**
| Action | Description |
|--------|-------------|
| `setMessages(roomKey, msgs)` | Replace full message array (called on WS history + REST poll) |
| `addMessage(roomKey, msg)` | Append if `msg.id` not already present (dedup) |
| `replaceTempMessage(roomKey, tempId, realMsg)` | Swap optimistic temp → server-confirmed message |
| `removeMessage(roomKey, msgId)` | Remove by id (error rollback) |
| `markRead(roomKey, userId, messageIds)` | Update `read_by` array on specific messages |
| `resetUnread(type, id)` | Zero the `unread_count` on a conversation/group |
| `setTyping(roomKey, userId, name, isTyping)` | Manage per-room typing indicators |

**PDF Report Workflow:**
- Employee uploads PDF via chat interface
- Creates `PdfReport` record (status: `pending`)
- Manager sees notification → can approve/reject via API
- Status updates: `pending → approved/rejected`

---

#### Chat Popup Widget

A floating WhatsApp/Messenger-style chat widget rendered on every dashboard page via `Layout.jsx`.

**Component tree:**
```
ChatPopup (root — fixed bottom-right z-50)
 ├── FloatingButton  (56px indigo circle, unread badge)
 └── Panel (320×480px, slate-800)
      ├── ConversationList  (search bar, [+] new-DM, conv rows with unread counts)
      └── ChatWindow        (header with status dot + [←] back + [↗] full-chat,
                             scrollable message list, textarea + Enter-to-send,
                             typing indicator, read receipts via WS)
```

**Key behaviours:**
- Panel closes on `mousedown` outside the widget (not `click`)
- Red unread badge (`bg-red-500`) on the floating button when `totalUnread > 0` and panel is closed
- Indigo unread count badge on each conversation row
- WS hook (`useChat`) auto-reconnects every 5 s on disconnect
- `usePresenceStore` drives the online/away/offline status dot in the ChatWindow header
- "Open full chat ↗" link and `[↗]` header button both navigate to `/chat`

---

### 11. Activity Logging

Every significant action in the system is logged to `ActivityLog` and broadcast live.

**`log_activity()` Usage Pattern:**
```python
# Called from views after every state change
log_activity(
    actor=request.user,
    verb='created',
    description=f'{request.user.full_name} created task "{task.name}"',
    target_type='task',
    target_id=task.id,
    target_name=task.name,
)
```

**ActivityLog Model:**
```python
class ActivityLog(models.Model):
    actor       = ForeignKey(User, ...)
    verb        = CharField(max_length=50)      # 'created', 'updated', 'deleted'
    description = TextField()
    target_type = CharField(max_length=50)      # 'task', 'employee', 'department'
    target_id   = IntegerField(null=True)
    target_name = CharField(max_length=200)
    extra_data  = JSONField(default=dict)
    ip_address  = GenericIPAddressField(null=True)
    created_at  = DateTimeField(auto_now_add=True)
```

**Live Feed:** After saving, `log_activity` does `channel_layer.group_send("activity_feed", ...)`. The `LiveActivityFeed` React component subscribes to this via WebSocket and prepends new events in real time.

---

### 12. Notifications

**Notification Model:**
```python
class Notification(models.Model):
    recipient = ForeignKey(User, related_name='notifications')
    title     = CharField(max_length=200)
    message   = TextField()
    type      = CharField(choices=['task_assigned','task_updated','mention','system'])
    priority  = CharField(choices=['low','medium','high'], default='medium')
    link      = CharField(max_length=500, blank=True)  # deep-link URL
    is_read   = BooleanField(default=False)
    read_at   = DateTimeField(null=True)
    created_at= DateTimeField(auto_now_add=True)
```

**Delivery:** When a notification is created, it's also pushed via WebSocket to group `notifications_{user_id}`:
```python
async_to_sync(channel_layer.group_send)(
    f"notifications_{notification.recipient_id}",
    {"type": "notification.new", "data": NotificationSerializer(notification).data}
)
```

**Frontend Bell Badge:**
- `TopBar.jsx` polls `/api/notifications/unread-count/` every 15 seconds
- Also receives live count updates via WebSocket
- Red badge shows count; closes on outside-click via `useRef` + `useEffect`

---

### 13. Analytics Engine

All analytics are computed in `apps/analytics/views.py` using Django ORM aggregations.

**Dashboard KPIs** (`/api/analytics/dashboard/`):
```python
{
  "total_employees": Employee.objects.count(),
  "active_today":    AttendanceLog.objects.filter(date=today, check_in__isnull=False).count(),
  "total_tasks":     Task.objects.count(),
  "completed_tasks": Task.objects.filter(status='completed').count(),
  "overdue_tasks":   Task.objects.filter(deadline__lt=now, status__in=['pending','in_progress']).count(),
  "completion_rate": round(completed / total * 100, 1),
}
```

**Tasks Over Time** (`/api/analytics/tasks-over-time/?days=14`):
```python
# Returns list of {date, created, completed} for the last N days
# Uses TruncDate + annotate + values_list for efficient single query
```

**Tasks by Department** — `Group by department → count by status`

**Tasks by Priority** — `Count tasks per priority level`

**Employee Productivity Ranking** — sorted by `completed_tasks / total_tasks * 100`

---

### 14. Task Management System

**Task Status Lifecycle:**
```
pending → in_progress → completed
                     → delayed      (past deadline + not completed)
                     → cancelled
```

**Task History Tracking** — Every field change is recorded:
```python
class TaskHistory(models.Model):
    task       = ForeignKey(Task, related_name='history')
    changed_by = ForeignKey(User, ...)
    field_name = CharField(max_length=100)   # 'status', 'priority', 'assigned_to'
    old_value  = TextField()
    new_value  = TextField()
    changed_at = DateTimeField(auto_now_add=True)
```

**Auto-detect changes in serializer `update()`:**
```python
def update(self, instance, validated_data):
    for field, new_val in validated_data.items():
        old_val = getattr(instance, field)
        if old_val != new_val:
            TaskHistory.objects.create(
                task=instance, changed_by=self.context['request'].user,
                field_name=field, old_value=str(old_val), new_value=str(new_val)
            )
    return super().update(instance, validated_data)
```

**Comments & Attachments:**
- `TaskComment` — linked to task + author, supports `@mentions`
- `TaskAttachment` — file upload via `FileField`, stores filename + size

---

### 15. Department Management

**Department Model:**
```python
class Department(models.Model):
    name        = CharField(max_length=100, unique=True)
    description = TextField(blank=True)
    head        = ForeignKey(Employee, null=True, related_name='headed_departments')
    color       = CharField(max_length=7, default='#6366f1')  # hex color for UI badge
    created_at  = DateTimeField(auto_now_add=True)
```

**Department Stats** (computed in serializer):
```python
{
  "employee_count":  self.employees.filter(status='active').count(),
  "active_tasks":    Task.objects.filter(department=obj, status='in_progress').count(),
  "completed_tasks": Task.objects.filter(department=obj, status='completed').count(),
}
```

---

### 16. Daily Reports

Employees submit structured end-of-day reports tracked through a lifecycle: **draft → submitted → reviewed**.

**Key fields:** `report_date`, `tasks_assigned`, `tasks_completed`, `hours_worked`, `status`, `review_notes`

**Workflow:**
```
POST /api/daily-reports/                  create draft
POST /api/daily-reports/{id}/submit/      submit (notifies HR + Founder, logs ActivityLog)
POST /api/daily-reports/{id}/review/      manager reviews + adds notes
```

**Analytics** (`GET /api/daily-reports/analytics/`): `submitted_today`, `not_submitted_today`, `total_hours_today`, `hours_per_day` (14-day), `avg_hours`

---

### 17. HR Module

Full HR management suite for HR role and above, covering the complete employee lifecycle.

| Sub-module | Base Path | Description |
|------------|-----------|-------------|
| Dashboard | `/api/hr/dashboard/` | HR KPI summary |
| Leave Management | `/api/hr/leave/` | Apply, approve, reject leave |
| Leave Balances | `/api/hr/leave/balances/` | Per-employee entitlement |
| Documents | `/api/hr/documents/` | HR document store |
| Attendance (HR) | `/api/hr/attendance/` | Full team view + CSV export |
| Payroll | `/api/hr/payroll/` | Payroll dashboard |
| Salaries | `/api/hr/salaries/` | Salary structures |
| Payslips | `/api/hr/payslips/` | Generate + download PDF payslips |
| Hiring Pipeline | `/api/hr/hiring/pipeline/` | Kanban hiring board |
| Jobs | `/api/hr/jobs/` | Job position postings |
| Candidates | `/api/hr/candidates/` | Candidate tracking + stage updates |
| Interviews | `/api/hr/interviews/` | Interview scheduling |
| Evaluations | `/api/hr/evaluations/` | Candidate evaluation forms |
| HR Tasks | `/api/hr/tasks/` | HR-specific task assignments |

**Candidate → Employee:** `POST /api/hr/candidates/{id}/convert/` auto-creates User + Employee records.

---

### 18. Time Tracking

Task-level timer tracking and daily productivity monitoring.

| Model | Purpose |
|-------|---------|
| `DailyReport` | Manager-visible daily work summary per employee |
| `TaskTimer` | Start/stop timer attached to a specific task |

**Timer lifecycle:**
```
POST /api/tracking/timers/               start timer
POST /api/tracking/timers/{id}/stop/     stop (auto-calculates duration)
GET  /api/tracking/timers/summary/       total time per task/employee
GET  /api/tracking/productivity/         manager productivity dashboard
GET  /api/tracking/online-users/         currently active users
```

---


## API Reference

### Authentication
| Method | Endpoint                    | Auth | Description              |
|--------|-----------------------------|------|--------------------------|
| POST   | `/api/auth/login/`          | No   | Login → returns JWT pair |
| POST   | `/api/auth/logout/`         | Yes  | Blacklist refresh token  |
| GET    | `/api/auth/profile/`        | Yes  | Current user profile     |
| PATCH  | `/api/auth/profile/`        | Yes  | Update profile           |
| POST   | `/api/auth/change-password/`| Yes  | Change own password      |
| POST   | `/api/auth/token/refresh/`  | No   | Refresh access token     |
| POST   | `/api/auth/register/`       | Admin| Create new user          |

### Employees
| Method | Endpoint                          | Roles         | Description           |
|--------|-----------------------------------|---------------|-----------------------|
| GET    | `/api/employees/`                 | Manager+      | List with pagination  |
| POST   | `/api/employees/`                 | Admin+        | Add employee          |
| GET    | `/api/employees/{id}/`            | Manager+      | Full profile          |
| PATCH  | `/api/employees/{id}/`            | Admin+        | Update employee       |
| DELETE | `/api/employees/{id}/`            | Founder/Admin | Soft-delete employee  |
| GET    | `/api/employees/{id}/tasks/`      | Manager+      | Employee's task list  |
| GET    | `/api/employees/{id}/activity/`   | Manager+      | Activity timeline     |
| GET    | `/api/employees/active-today/`    | Manager+      | Checked-in today      |

### Tasks
| Method | Endpoint                          | Roles          | Description           |
|--------|-----------------------------------|----------------|-----------------------|
| GET    | `/api/tasks/`                     | All            | Filtered by role      |
| POST   | `/api/tasks/`                     | Manager+       | Create task           |
| GET    | `/api/tasks/{id}/`                | All (own only) | Task detail           |
| PATCH  | `/api/tasks/{id}/`                | Manager+       | Update task           |
| DELETE | `/api/tasks/{id}/`                | Manager+       | Delete task           |
| PATCH  | `/api/tasks/{id}/progress/`       | All            | Update progress %     |
| POST   | `/api/tasks/{id}/comments/`       | All            | Add comment           |
| GET    | `/api/tasks/{id}/history/`        | All            | Change history        |
| POST   | `/api/tasks/{id}/attachments/`    | All            | Upload file           |

### Departments
| Method | Endpoint                          | Roles     | Description           |
|--------|-----------------------------------|-----------|-----------------------|
| GET    | `/api/departments/`               | All       | List departments      |
| POST   | `/api/departments/`               | Admin+    | Create department     |
| PATCH  | `/api/departments/{id}/`          | Admin+    | Update department     |
| DELETE | `/api/departments/{id}/`          | Admin+    | Delete department     |

### Attendance
| Method | Endpoint                          | Roles     | Description              |
|--------|-----------------------------------|-----------|--------------------------|
| POST   | `/api/attendance/checkin/`        | All       | Check in for today       |
| POST   | `/api/attendance/checkout/`       | All       | Check out for today      |
| GET    | `/api/attendance/today/`          | All       | Today's personal record  |
| GET    | `/api/attendance/my-history/`     | All       | Own attendance history   |
| GET    | `/api/attendance/`                | Manager+  | All employee records     |
| GET    | `/api/attendance/presence/`       | Manager+  | Online/offline status    |

### Analytics
| Method | Endpoint                                 | Roles    | Description              |
|--------|------------------------------------------|----------|--------------------------|
| GET    | `/api/analytics/dashboard/`              | Manager+ | KPI summary              |
| GET    | `/api/analytics/tasks-over-time/`        | Manager+ | Line chart (14 days)     |
| GET    | `/api/analytics/tasks-by-department/`    | Manager+ | Bar chart                |
| GET    | `/api/analytics/tasks-by-priority/`      | Manager+ | Priority distribution    |
| GET    | `/api/analytics/employee-productivity/`  | Manager+ | Ranked productivity      |
| GET    | `/api/analytics/completion-rate/`        | Manager+ | Overall % complete       |

### Chat
| Method | Endpoint                                       | Roles | Description                          |
|--------|------------------------------------------------|-------|--------------------------------------|
| GET    | `/api/chat/users/`                             | All   | Messageable users (role-filtered)    |
| GET    | `/api/chat/conversations/`                     | All   | List my direct conversations         |
| POST   | `/api/chat/conversations/create/`              | All   | Get-or-create DM `{ user_id }`       |
| GET    | `/api/chat/conversations/{id}/messages/`       | All   | Message history                      |
| POST   | `/api/chat/conversations/{id}/send/`           | All   | Send message (text or file upload)   |
| GET    | `/api/chat/groups/`                            | All   | List my groups (paginated)           |
| POST   | `/api/chat/groups/`                            | All   | Create group                         |
| GET    | `/api/chat/groups/{id}/`                       | All   | Group detail                         |
| PATCH  | `/api/chat/groups/{id}/`                       | Admin | Update group                         |
| DELETE | `/api/chat/groups/{id}/`                       | Admin | Delete group                         |
| GET    | `/api/chat/groups/{id}/messages/`              | All   | Group message history                |
| POST   | `/api/chat/groups/{id}/send/`                  | All   | Send group message (text or file)    |
| POST   | `/api/chat/groups/{id}/members/`               | Admin | Add member `{ user_id }`             |
| DELETE | `/api/chat/groups/{id}/members/{user_id}/`     | Admin | Remove member                        |
| GET    | `/api/chat/reports/`                           | All   | My submitted PDF reports             |
| POST   | `/api/chat/reports/`                           | Employee | Submit PDF report                 |
| GET    | `/api/chat/reports/admin/`                     | Manager+ | All reports (approve/reject view) |
| GET    | `/api/chat/reports/{id}/`                      | All   | Report detail                        |
| PATCH  | `/api/chat/reports/{id}/`                      | Manager+ | Approve or reject report          |

### Daily Reports
| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/api/daily-reports/` | All | My reports (employee) or all (manager+) |
| POST | `/api/daily-reports/` | All | Create report draft |
| GET | `/api/daily-reports/my-reports/` | All | Own report history |
| GET | `/api/daily-reports/all/` | Manager+ | All reports with date range filter |
| GET | `/api/daily-reports/analytics/` | HR+ | Submission stats + hours data |
| GET | `/api/daily-reports/{id}/` | All (own) | Report detail |
| POST | `/api/daily-reports/{id}/submit/` | Employee | Submit draft (triggers notification) |
| POST | `/api/daily-reports/{id}/review/` | Manager+ | Review + add notes |

### HR
| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/api/hr/dashboard/` | HR+ | HR KPI summary |
| GET/POST | `/api/hr/leave/` | HR+/All | All leave requests / submit leave |
| GET | `/api/hr/leave/balances/` | HR+ | Per-employee leave balances |
| POST | `/api/hr/leave/{id}/approve/` | HR+ | Approve leave |
| POST | `/api/hr/leave/{id}/reject/` | HR+ | Reject leave |
| GET | `/api/hr/attendance/` | HR+ | Full team attendance |
| GET | `/api/hr/attendance/export/` | HR+ | Export attendance CSV |
| GET | `/api/hr/payroll/` | HR+ | Payroll dashboard |
| GET/POST | `/api/hr/salaries/` | HR+ | Salary structures |
| POST | `/api/hr/payslips/generate/` | HR+ | Generate payslip |
| GET | `/api/hr/payslips/{id}/download/` | HR+ | Download payslip PDF |
| GET | `/api/hr/hiring/pipeline/` | HR+ | Hiring pipeline kanban view |
| GET/POST | `/api/hr/candidates/` | HR+ | Candidates list / add |
| POST | `/api/hr/candidates/{id}/stage/` | HR+ | Update candidate stage |
| POST | `/api/hr/candidates/{id}/convert/` | HR+ | Convert to employee |
| GET/POST | `/api/hr/interviews/` | HR+ | Interview list / schedule |
| GET/POST | `/api/hr/jobs/` | HR+ | Job positions |

### Tracking
| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET/POST | `/api/tracking/reports/` | All | Work reports / submit |
| GET | `/api/tracking/reports/summary/` | Manager+ | Report summary stats |
| POST | `/api/tracking/reports/{id}/review/` | Manager+ | Review work report |
| GET/POST | `/api/tracking/timers/` | All | Timer list / start timer |
| POST | `/api/tracking/timers/{id}/stop/` | All | Stop timer |
| GET | `/api/tracking/timers/summary/` | All | Time summary per task |
| GET | `/api/tracking/productivity/` | Manager+ | Productivity dashboard |
| GET | `/api/tracking/online-users/` | Manager+ | Currently active users |


### Notifications
| Method | Endpoint                          | Description              |
|--------|-----------------------------------|--------------------------|
| GET    | `/api/notifications/`             | List notifications       |
| GET    | `/api/notifications/unread-count/`| Unread badge count       |
| POST   | `/api/notifications/mark-read/`   | Mark specific as read    |
| POST   | `/api/notifications/mark-all-read/`| Mark all as read        |

---

## WebSocket Events

### Activity Feed (`ws/activity/`)
```json
// Incoming (from server)
{ "type": "activity.update", "data": {
    "id": 1, "actor_name": "Ankit Sachan",
    "verb": "created", "description": "...",
    "target_type": "task", "target_name": "Build CRM",
    "created_at": "2026-03-06T10:41:00+05:30"
}}
```

### Notifications (`ws/notifications/`)
```json
{ "type": "notification.new", "data": {
    "id": 5, "title": "New Task Assigned",
    "message": "You have been assigned to Build CRM",
    "type": "task_assigned", "priority": "high",
    "link": "/tasks/13", "is_read": false
}}
```

### Presence (`ws/attendance/`)
```json
// Incoming (snapshot on connect)
{ "type": "presence.snapshot", "users": [
    { "user_id": 10, "name": "Ankit Sachan", "status": "online", "last_active": "just now" }
]}
// Incoming (status change)
{ "type": "presence.update", "user_id": 10, "status": "offline" }
```

### Chat (`ws/chat/<room_type>/<room_id>/?token=<jwt>`)
```json
// ── Incoming: on connect, last 60 messages delivered as history ──
{ "type": "history", "messages": [
    { "id": 42, "sender_id": 1, "sender_name": "Founder",
      "content": "Hello!", "created_at": "...", "read_by": [1, 3] }
]}

// ── Incoming: new message broadcast (from another user or self) ──
{ "type": "message",
  "id": 43, "sender_id": 3, "sender_name": "Ashvin Raygor",
  "content": "Hi back!", "created_at": "...", "read_by": [] }

// ── Incoming: read receipt ──
{ "type": "read_receipt", "user_id": 3, "message_ids": [42, 43] }

// ── Incoming: typing indicator ──
{ "type": "typing", "user_id": 3, "user_name": "Ashvin Raygor", "is_typing": true }

// ── Outgoing: mark messages as read ──
{ "type": "read", "message_ids": [42, 43] }

// ── Outgoing: typing indicator ──
{ "type": "typing", "is_typing": true }
```

---

## Role Permissions Matrix

| Feature                      | Founder | Admin | Manager | Employee |
|------------------------------|:-------:|:-----:|:-------:|:--------:|
| View all employees           |    ✓    |   ✓   |    ✓    |    ✗     |
| Add / delete employees       |    ✓    |   ✓   |    ✗    |    ✗     |
| View all tasks               |    ✓    |   ✓   |    ✓    | Own only |
| Create / assign tasks        |    ✓    |   ✓   |    ✓    |    ✗     |
| Update task progress         |    ✓    |   ✓   |    ✓    |    ✓     |
| View analytics & charts      |    ✓    |   ✓   |    ✓    |    ✗     |
| View live activity feed      |    ✓    |   ✓   |    ✓    | Own only |
| Register users               |    ✓    |   ✓   |    ✗    |    ✗     |
| Manage departments           |    ✓    |   ✓   |    ✗    |    ✗     |
| Attendance Monitor (all)     |    ✓    |   ✓   |    ✓    |    ✗     |
| My Attendance (personal)     |    ✓    |   ✓   |    ✓    |    ✓     |
| Submit daily work log        |    ✗    |   ✗   |    ✓    |    ✓     |
| Approve work logs            |    ✓    |   ✓   |    ✓    |    ✗     |
| View Reports page            |    ✓    |   ✓   |    ✓    |    ✗     |
| Chat (Direct messages)       |    ✓    |   ✓   |    ✓    | HR/Mgr+ only¹ |
| Chat (Group messages)        |    ✓    |   ✓   |    ✓    |    ✓     |
| Submit PDF report            |    ✗    |   ✗   |    ✗    |    ✓     |
| Approve PDF reports          |    ✓    |   ✓   |    ✓    |    ✗     |
| Manager Dashboard            |    ✓    |   ✓   |    ✓    |    ✗     |

> ¹ Employees can send/receive messages in existing DMs, but the DM picker (`GET /api/chat/users/`) only returns HR, Manager, Admin and Founder users — employees cannot initiate DMs with other employees.

---

## Database Schema

```
┌─────────────────────────────────────────────────────────────┐
│ users (auth_user)                                           │
│   id, email, full_name, role [founder|admin|manager|employee]│
│   is_active, is_online, last_seen, date_joined             │
└────────────────────────┬────────────────────────────────────┘
                         │ OneToOne
┌────────────────────────▼────────────────────────────────────┐
│ employees                                                    │
│   id, user_id, employee_id [EMP-0001], full_name, email,    │
│   phone, department_id, role, status, joining_date,         │
│   salary, address, profile_photo                            │
└────────────┬───────────────────────────────┬────────────────┘
             │ ForeignKey                    │ ForeignKey
┌────────────▼───────────────┐  ┌────────────▼───────────────┐
│ tasks                       │  │ departments                 │
│   id, task_id [TASK-0001]   │  │   id, name, description,   │
│   name, description,        │  │   head_id, color           │
│   assigned_to_id,           │  └────────────────────────────┘
│   assigned_by_id,           │
│   department_id, priority,  │
│   status, progress,         │
│   start_date, deadline,     │
│   completed_at              │
└────────────┬────────────────┘
             │ ForeignKey (3 tables)
  ┌──────────┼──────────────────────┐
  │          │                      │
┌─▼──────────┐ ┌──────────────┐ ┌──▼──────────────┐
│task_comments│ │task_attachments│ │task_history     │
│  id, task_id│ │  id, task_id  │ │  id, task_id    │
│  author_id  │ │  uploaded_by  │ │  changed_by_id  │
│  content    │ │  file, size   │ │  field_name     │
└─────────────┘ └──────────────┘ │  old_value      │
                                  │  new_value      │
                                  └─────────────────┘

┌──────────────────────────────────────────────────────────┐
│ attendance_logs                                          │
│   id, employee_id, date, check_in, check_out,           │
│   total_hours, status [present|absent|half_day|late]    │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ user_presence                                            │
│   id, user_id (OneToOne), status [online|away|offline], │
│   last_active, session_start                            │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ activity_logs                                            │
│   id, actor_id, verb, description, target_type,         │
│   target_id, target_name, extra_data (JSON), ip_address │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ notifications                                            │
│   id, recipient_id, title, message, type, priority,     │
│   link, is_read, read_at, created_at                    │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ chat_direct_conversations   chat_groups                  │
│   id, participant_1_id       id, name, avatar, admin_id  │
│   participant_2_id           description, created_at     │
│                                                          │
│ chat_group_memberships      messages                     │
│   id, group_id, user_id      id, sender_id, content,    │
│   role [admin|member]        conversation_id OR group_id │
│   joined_at                  file_attachment, created_at │
└──────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- PostgreSQL 14+
- Redis 7+ *(optional — all features except live WS work without it)*

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux/macOS

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your DB credentials

# Create PostgreSQL database
psql -U postgres -c "CREATE DATABASE crm_db;"

# Run migrations
python manage.py makemigrations
python manage.py migrate

# Create a founder account
python manage.py createsuperuser

# Start server (HTTP-only, no WebSockets)
python manage.py runserver

# OR start with full WebSocket support
daphne -b 0.0.0.0 -p 8000 config.asgi:application
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev       # dev server at http://localhost:5173
npm run build     # production build → dist/
```

### Start Redis (for WebSockets)

```bash
# Windows (via WSL or Chocolatey)
redis-server

# Verify
redis-cli ping    # → PONG
```

---

## Environment Variables

```env
# backend/.env

# Django
SECRET_KEY=your-long-random-secret-key
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# Database
DB_NAME=crm_db
DB_USER=postgres
DB_PASSWORD=yourpassword
DB_HOST=localhost
DB_PORT=5432

# Redis (optional — WebSocket features)
REDIS_URL=redis://localhost:6379/0

# JWT
ACCESS_TOKEN_LIFETIME_MINUTES=60
REFRESH_TOKEN_LIFETIME_DAYS=7

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

---

## Development Notes

### Timezone
All datetimes are stored in **UTC** internally (`USE_TZ=True`). The `TIME_ZONE = 'Asia/Kolkata'` setting ensures `timezone.localtime()` converts to **IST (UTC+5:30)** for display. Never store local time directly — always use `timezone.now()`.

### Presence Without Redis
The `OnlineTrackingJWTAuthentication` backend marks users online via HTTP requests (throttled to 1 DB write per 60 seconds). This means:
- Online status works even without Redis running
- The presence dashboard uses `User.is_online` as the primary source
- `UserPresence.status` (WebSocket-based) is a secondary/fallback source

### Adding a New API Endpoint
1. Create/update model in `apps/<app>/models.py`
2. Run `python manage.py makemigrations && migrate`
3. Create serializer in `serializers.py`
4. Add view to `views.py` (ViewSet or APIView)
5. Register URL in `apps/<app>/urls.py` or root `config/urls.py`
6. Add service function in `frontend/src/services/api.js`
7. Use with `useQuery` or `useMutation` in your React component

### Calling `log_activity()` in Views
```python
from apps.activity.utils import log_activity

# After any significant state change:
log_activity(
    actor=request.user,
    verb='updated',
    description=f'{request.user.full_name} updated task status to Completed',
    target_type='task',
    target_id=task.id,
    target_name=task.name,
)
```

### WebSocket Graceful Degradation
All WS consumers wrap `channel_layer.group_send` in `try/except`:
```python
try:
    await channel_layer.group_send("activity_feed", {...})
except Exception:
    pass  # Redis down — silently skip broadcast, DB record already saved
```

This ensures the API still works even when Redis is unavailable.

---

## Testing

### Integration Tests

The integration test suite (`backend/test_integration.py`) exercises the Daily Reports API end-to-end against the live Django app and database.

**Test groups:**

| ID | Test | What Is Checked |
|----|------|-----------------|
| INTEG-1 | Analytics match DB | `submitted_today` API value equals live DB count |
| INTEG-1a | Hours is numeric | `total_hours_today` returns int/float |
| INTEG-1b | Hours per day | At most 14 entries in rolling window |
| INTEG-2 | Notification on submit | HR + Founder receive notification after submission |
| INTEG-2a | Founder notified | Founder notification count increases |
| INTEG-3 | ActivityLog on submit | `daily_report_submitted` log exists |
| INTEG-3a | target_type correct | `target_type == "daily_report"` |
| INTEG-4 | ActivityLog on review | `daily_report_reviewed` log exists |
| INTEG-5 | my-reports count | API count matches DB count per employee |
| INTEG-6 | submitted + not_submitted = total | Consistency check across analytics |
| INTEG-7 | Date range filter | `/all/?date_from=&date_to=` returns correct results |
| INTEG-7a | Results in range | All returned reports fall within requested dates |
| INTEG-8 | Detail fields | `GET /daily-reports/{pk}/` returns all required fields |

**How to run:**
```bash
cd backend
# Ensure Django server is running on port 8000
python test_integration.py
# Output: [PASS] / [FAIL] per test, summary at end
# Results saved to /tmp/integ_results.json
```

> **Note:** Tests create real DB records (reports, submissions). They use test employees and clean up within the run. Run against development DB only.

---

## Deployment

### EC2 One-Command Deploy (`deploy/run_deploy.sh`)

Automates full production setup on a fresh Ubuntu EC2 instance.

```bash
# On the EC2 server (after git clone)
cd /home/ubuntu/promope-crm
chmod +x deploy/run_deploy.sh
./deploy/run_deploy.sh
```

**What the script does (7 steps):**

| Step | Action |
|------|--------|
| 1 | Create Python virtualenv at `~/promope-crm/venv` |
| 2 | `pip install -r backend/requirements.txt` |
| 3 | Generate `backend/.env` with random `SECRET_KEY` (skips if exists) |
| 4 | Run `python manage.py migrate --noinput` |
| 5 | Run `python manage.py collectstatic --noinput` |
| 6 | `npm install && npm run build` (React production build) |
| 7 | Install systemd service + Nginx config, reload both |

**Post-deploy health check** (printed automatically):
```
  Daphne  : RUNNING
  Nginx   : RUNNING
  Postgres: RUNNING
  Redis   : RUNNING
```

**Deploy files:**

| File | Purpose |
|------|---------|
| `deploy/promope-crm.service` | systemd unit — runs Daphne as a service |
| `deploy/nginx.conf` | Nginx reverse proxy — proxies `/api/` and `/ws/` to Daphne, serves React `dist/` |
| `deploy/run_deploy.sh` | Full setup automation script |

**Manual redeploy (after code push):**
```bash
ssh -i CRM.pem ubuntu@<EC2-IP>
cd /home/ubuntu/promope-crm
git pull origin main
source venv/bin/activate
cd backend && python manage.py migrate --noinput
cd ../frontend && npm run build
sudo systemctl restart promope-crm
```

---

## Android Mobile App

The `android-wrapper-app/` directory contains a **native Kotlin Android APK** that wraps the PromoPe CRM website in a WebView shell — no React Native, no Expo.

**Repo:** [iankit-sachan/promope-android](https://github.com/iankit-sachan/promope-android)

### Architecture

```
Android APK
  SplashActivity
  MainActivity
    └── WebView (loads https://team.promope.site)
          └── ChatBridge (window.Android.*)
  ChatNotificationService (ForegroundService)
  NotificationHelper
```

### Native Chat Notifications

Push notifications for new chat messages are handled entirely in the native layer — no changes to the React frontend required.

**Flow:**
```
onPageFinished → inject JS → reads localStorage['crm-auth'].state.accessToken
  → window.Android.setAuthToken(token)
    → ChatBridge saves JWT to SharedPreferences
      → starts ChatNotificationService

ChatNotificationService
  → every 30 seconds: GET /api/chat/conversations/ (Bearer JWT)
  → unread_count grew? → postChatNotification(sender, preview)
                       → updateBadge(totalUnread)

Notification tap → PendingIntent → onNewIntent()
  → webView.evaluateJavascript("window.location.href='/chat'")
```

### JS ↔ Native Bridge (`window.Android`)

| Method | Called By | Action |
|--------|-----------|--------|
| `setAuthToken(token)` | JS injection on page load | Save JWT, start polling service |
| `updateUnreadBadge(count)` | React chatStore | Update launcher icon badge |
| `clearAuthToken()` | React logout | Remove JWT, stop service, clear badge |

### Build

```bash
cd android-wrapper-app
.\gradlew.bat assembleDebug
# Output: app/build/outputs/apk/debug/app-PromoPe.apk (~5.5 MB)
```

### Install via ADB

```bash
adb install -r app/build/outputs/apk/debug/app-PromoPe.apk
```

For full documentation see [`android-wrapper-app/README.md`](android-wrapper-app/README.md).
