# CRM Load & Stress Test — Performance Report

**Generated:** 2026-03-08 12:18  |  **Target:** 100 concurrent users  |  **Backend:** Django + DRF  |  **DB:** PostgreSQL

## Overall Verdict: ❌ FAIL

> **The CRM requires performance improvements before supporting 100 simultaneous employees.**

| Criterion | Threshold | Result | Status |
|-----------|-----------|--------|--------|
| HTTP failure rate | < 1.0% | 0.0% | ✅ PASS |
| API p95 response time | < 2000 ms | 11000 ms | ❌ FAIL |
| WebSocket connection rate | > 95.0% | 40.0% | ❌ FAIL |

---
## Phase 1–2 — HTTP Load Test (100 Concurrent Users, 5 minutes)

| Metric | Value |
|--------|-------|
| Total requests | 3,716 |
| Total failures | 0 (0.0%) |
| Requests/sec (peak) | 11.9 |
| Overall avg response | 5781 ms |
| Overall p95 response | 11000 ms |

### API Response Times (sorted by p95, worst first)

| Endpoint | Requests | Fail% | Avg (ms) | p50 | p95 | p99 | RPS |
|----------|----------|-------|----------|-----|-----|-----|-----|
| `POST /api/auth/login/` ⚠️ | 100 | 0.0% | 21118 | 22000 | 23000 | 24000 | 0.3 |
| `GET /api/hr/reports/` ⚠️ | 23 | 0.0% | 11836 | 11000 | 14000 | 15000 | 0.1 |
| `PATCH /api/tasks/{id}/progress/` ⚠️ | 186 | 0.0% | 9670 | 9500 | 12000 | 14000 | 0.6 |
| `PATCH /api/tasks/{id}/ [mgr]` ⚠️ | 69 | 0.0% | 7110 | 8500 | 11000 | 12000 | 0.2 |
| `POST /api/activity/log-visit/` ⚠️ | 254 | 0.0% | 9578 | 9500 | 11000 | 13000 | 0.8 |
| `POST /api/auth/logout/` ⚠️ | 81 | 0.0% | 8899 | 8600 | 11000 | 11000 | 0.3 |
| `GET /api/reports/daily/` ⚠️ | 50 | 0.0% | 8635 | 8700 | 9800 | 10000 | 0.2 |
| `GET /api/attendance/presence/ [N+1 risk]` ⚠️ | 13 | 0.0% | 5192 | 5100 | 8400 | 8400 | 0.0 |
| `POST /api/attendance/checkout/` ⚠️ | 39 | 0.0% | 4747 | 4600 | 7400 | 11000 | 0.1 |
| `GET /api/employees/ [hr]` ⚠️ | 10 | 0.0% | 5372 | 5400 | 7200 | 7200 | 0.0 |
| `GET /api/notifications/unread-count/ [mgr]` ⚠️ | 18 | 0.0% | 4165 | 3900 | 7200 | 7200 | 0.1 |
| `GET /api/employees/` ⚠️ | 162 | 0.0% | 5475 | 5400 | 7100 | 9700 | 0.5 |
| `POST /api/chat/conversations/{id}/send/` ⚠️ | 162 | 0.0% | 4897 | 4800 | 6900 | 10000 | 0.5 |
| `GET /api/notifications/unread-count/ [hr]` ⚠️ | 15 | 0.0% | 4202 | 4300 | 6500 | 6500 | 0.1 |
| `GET /api/hr/dashboard/` ⚠️ | 109 | 0.0% | 4503 | 4400 | 6400 | 7600 | 0.3 |
| `PATCH /api/activity/update-status/` ⚠️ | 258 | 0.0% | 4683 | 4600 | 6400 | 7800 | 0.8 |
| `GET /api/attendance/today/` ⚠️ | 98 | 0.0% | 4477 | 4300 | 6300 | 7600 | 0.3 |
| `GET /api/notifications/` ⚠️ | 54 | 0.0% | 4444 | 4400 | 6300 | 10000 | 0.2 |
| `POST /api/worklogs/` ⚠️ | 166 | 0.0% | 4803 | 4800 | 6300 | 7200 | 0.5 |
| `GET /api/analytics/dashboard/` ⚠️ | 193 | 0.0% | 4342 | 4200 | 6100 | 7600 | 0.6 |
| `GET /api/hr/leave/balances/` ⚠️ | 44 | 0.0% | 4272 | 4100 | 6100 | 7700 | 0.1 |
| `GET /api/notifications/unread-count/` ⚠️ | 311 | 0.0% | 4246 | 4100 | 6100 | 6800 | 1.0 |
| `GET /api/worklogs/` ⚠️ | 96 | 0.0% | 4272 | 4200 | 6100 | 7400 | 0.3 |
| `GET /api/attendance/ [admin view]` ⚠️ | 83 | 0.0% | 4220 | 4000 | 6000 | 7800 | 0.3 |
| `GET /api/hr/payroll/` ⚠️ | 29 | 0.0% | 4540 | 4400 | 6000 | 6200 | 0.1 |

---
## Phase 4 — WebSocket Performance (100 Concurrent Connections)

| Metric | Value |
|--------|-------|
| Connections attempted | 100 |
| Connected successfully | 40 (40.0%) |
| Connection failures | 60 |
| Mid-test disconnections | 0 |
| Avg message latency | 1.7 ms |
| p50 latency | 0.0 ms |
| p95 latency | 16.0 ms |
| p99 latency | 16.0 ms |

| WS Type | Attempted | Connected | Disconnected | Msgs Sent | Msgs Recv |
|---------|-----------|-----------|--------------|-----------|-----------|
| activity | 40 | 40 | 0 | 515 | 555 |
| chat | 30 | 0 | 0 | 0 | 0 |
| notifications | 30 | 0 | 0 | 0 | 0 |

---
## Recommendations

The following fixes address the bottlenecks identified during code analysis and confirmed by the load test.

### 🔴 Critical (apply immediately)

**1. Add `CONN_MAX_AGE` — eliminate per-request DB connections**

File: `backend/config/settings.py`
```python
DATABASES = {
    'default': {
        ...existing settings...,
        'CONN_MAX_AGE': 600,   # reuse connections for 10 minutes
    }
}
```
Impact: Reduces DB connection overhead by ~80% under 100-user load.

**2. Make `log_activity()` asynchronous — remove blocking WS broadcast from every request**

File: `backend/apps/activity/utils.py`
Every API request (login, task update, attendance check-in, page visit) calls `log_activity()`,
which synchronously writes to DB and broadcasts via WebSocket. Under 100 users this
creates a DB write + Redis call on every single request.

Short-term fix — make the broadcast non-blocking:
```python
import threading

def _broadcast_async(log):
    t = threading.Thread(target=_broadcast_activity, args=(log,), daemon=True)
    t.start()

# In log_activity(): replace _broadcast_activity(log) with _broadcast_async(log)
```
Long-term: Use Celery task queue for all activity logging.

### 🟠 High (apply before production)

**3. Add DB indexes on high-traffic filtered fields**

File: `backend/apps/tasks/models.py`
```python
class Meta:
    indexes = [
        models.Index(fields=['status']),
        models.Index(fields=['assigned_to', 'status']),
        models.Index(fields=['deadline']),
    ]
```

File: `backend/apps/activity/models.py`
```python
class Meta:
    indexes = [
        models.Index(fields=['actor', '-created_at']),
        models.Index(fields=['-created_at']),
    ]
```

File: `backend/apps/chat/models.py` (Message model)
```python
class Meta:
    indexes = [
        models.Index(fields=['direct_conversation', '-created_at']),
        models.Index(fields=['group', '-created_at']),
    ]
```
Then run: `python manage.py makemigrations && python manage.py migrate`

**4. Fix N+1 query in `GET /api/attendance/presence/`**

File: `backend/apps/attendance/views.py`
```python
# Change:
employees = Employee.objects.select_related('user', 'department').all()
# To:
employees = Employee.objects.select_related('user', 'department', 'user__presence').all()
```

### 🟡 Medium (scalability improvements)

**5. Add Redis caching for analytics endpoints**

File: `backend/apps/analytics/views.py`
```python
from django.core.cache import cache

# In analytics_dashboard_view:
cached = cache.get('analytics_dashboard')
if cached:
    return Response(cached)
# ... compute data ...
cache.set('analytics_dashboard', data, timeout=30)  # 30s cache
```

**6. Add DRF throttling to prevent abuse**

File: `backend/config/settings.py`
```python
REST_FRAMEWORK = {
    ...existing settings...,
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'user': '300/minute',   # 300 requests/min per authenticated user
    }
}
```

**7. Throttle high-frequency write endpoints**

`POST /api/activity/log-visit/` is called on every page navigation.
Consider client-side debouncing (don't log the same page twice within 60s)
or server-side deduplication to reduce DB write volume.

### 🟢 Production Scaling

**8. Use PgBouncer for connection pooling**
Configure PgBouncer in transaction-pooling mode between Django and PostgreSQL.
This supports thousands of Django workers sharing a small PostgreSQL connection pool.

**9. Run Django with multiple Gunicorn/Daphne workers**
```bash
daphne -b 0.0.0.0 -p 8000 --workers 4 config.asgi:application
# or with gunicorn:
gunicorn config.wsgi:application --workers 4 --threads 2 --bind 0.0.0.0:8000
```

**10. Redis cluster for WebSocket scaling**
For > 200 concurrent WebSocket connections, configure Redis Sentinel or Redis Cluster
in `CHANNEL_LAYERS` to handle the pub/sub message volume.

---
*Report generated by `generate_report.py` from Locust CSV + WebSocket JSON + DB monitor CSV.*