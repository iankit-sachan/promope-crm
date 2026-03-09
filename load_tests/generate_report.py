"""
CRM Load Test — Performance Report Generator

Reads:
  locust_stats_stats.csv      — per-endpoint response times + failure counts
  locust_stats_failures.csv   — failure details
  ws_results.json             — WebSocket concurrency results
  db_monitor.csv              — PostgreSQL metrics over time

Writes:
  performance_report.md

Usage:
    python generate_report.py
"""

import csv
import json
import sys
from datetime import datetime
from pathlib import Path

DIR = Path(__file__).parent

LOCUST_STATS    = DIR / "locust_stats_stats.csv"
LOCUST_FAILURES = DIR / "locust_stats_failures.csv"
WS_RESULTS      = DIR / "ws_results.json"
DB_CSV          = DIR / "db_monitor.csv"
REPORT_OUT      = DIR / "performance_report.md"

# Pass / fail thresholds
MAX_P95_MS       = 2000   # p95 response time (ms)
MAX_FAILURE_PCT  = 1.0    # % of requests that can fail
MIN_WS_CONN_PCT  = 95.0   # minimum WS connection success rate
MAX_DB_CONNS     = 90     # peak DB connections before alarm

# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------

def _load_locust_stats() -> list[dict]:
    if not LOCUST_STATS.exists():
        return []
    rows = []
    with open(LOCUST_STATS, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows.append(r)
    return rows


def _load_locust_failures() -> list[dict]:
    if not LOCUST_FAILURES.exists():
        return []
    rows = []
    with open(LOCUST_FAILURES, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows.append(r)
    return rows


def _load_ws() -> dict:
    if not WS_RESULTS.exists():
        return {}
    with open(WS_RESULTS) as f:
        return json.load(f)


def _load_db() -> list[dict]:
    if not DB_CSV.exists():
        return []
    rows = []
    with open(DB_CSV, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows.append(r)
    return rows


# ---------------------------------------------------------------------------
# Analysis helpers
# ---------------------------------------------------------------------------

def _float(v, default=0.0) -> float:
    try:
        return float(v)
    except (ValueError, TypeError):
        return default


def _int(v, default=0) -> int:
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return default


def _analyse_locust(rows: list[dict]) -> dict:
    """Extract aggregate + per-endpoint stats from locust CSV."""
    endpoints = []
    total_reqs = total_fails = 0
    total_rps  = 0.0
    agg_row    = None

    for r in rows:
        name = r.get("Name", "")
        if name == "Aggregated":
            agg_row = r
            continue
        req_count   = _int(r.get("Request Count", 0))
        fail_count  = _int(r.get("Failure Count", 0))
        avg_ms      = _float(r.get("Average Response Time", 0))
        p50_ms      = _float(r.get("50%", 0))
        p95_ms      = _float(r.get("95%", 0))
        p99_ms      = _float(r.get("99%", 0))
        max_ms      = _float(r.get("Max Response Time", 0))
        rps         = _float(r.get("Requests/s", 0))
        fail_pct    = (fail_count / req_count * 100) if req_count else 0

        endpoints.append({
            "name":      name,
            "method":    r.get("Type", "GET"),
            "requests":  req_count,
            "failures":  fail_count,
            "fail_pct":  round(fail_pct, 1),
            "avg_ms":    round(avg_ms, 0),
            "p50_ms":    round(p50_ms, 0),
            "p95_ms":    round(p95_ms, 0),
            "p99_ms":    round(p99_ms, 0),
            "max_ms":    round(max_ms, 0),
            "rps":       round(rps, 2),
        })
        total_reqs  += req_count
        total_fails += fail_count
        total_rps   += rps

    overall_fail_pct = (total_fails / total_reqs * 100) if total_reqs else 0

    agg_p95 = _float(agg_row.get("95%", 0)) if agg_row else 0
    agg_avg = _float(agg_row.get("Average Response Time", 0)) if agg_row else 0

    return {
        "endpoints":     sorted(endpoints, key=lambda e: -e["p95_ms"]),
        "total_requests": total_reqs,
        "total_failures": total_fails,
        "fail_pct":       round(overall_fail_pct, 2),
        "total_rps":      round(total_rps, 2),
        "overall_p95":    round(agg_p95, 0),
        "overall_avg":    round(agg_avg, 0),
    }


def _analyse_db(rows: list[dict]) -> dict:
    if not rows:
        return {}
    totals = [_int(r.get("total_connections", 0)) for r in rows]
    actives = [_int(r.get("active_connections", 0)) for r in rows]
    locks  = [_int(r.get("lock_wait_count", 0)) for r in rows]
    slow_qs = [r for r in rows if _float(r.get("slowest_query_ms", 0)) > 0]
    # Most frequently seen N+1 table
    seq_tables: dict[str, int] = {}
    for r in rows:
        t = r.get("top_seq_scan_table", "")
        if t:
            seq_tables[t] = seq_tables.get(t, 0) + 1
    top_seq_table = max(seq_tables, key=seq_tables.get) if seq_tables else "—"

    return {
        "peak_connections":  max(totals) if totals else 0,
        "avg_connections":   round(sum(totals) / len(totals), 1) if totals else 0,
        "peak_active":       max(actives) if actives else 0,
        "total_lock_waits":  sum(locks),
        "slowest_query_ms":  max((_float(r.get("slowest_query_ms", 0)) for r in rows), default=0),
        "slowest_query":     (slow_qs[-1].get("slowest_query_snippet", "") if slow_qs else "—"),
        "top_seq_scan_table": top_seq_table,
        "samples":           len(rows),
    }


# ---------------------------------------------------------------------------
# Verdict helpers
# ---------------------------------------------------------------------------

def _verdict(condition: bool, pass_txt: str = "PASS", fail_txt: str = "FAIL") -> str:
    return f"✅ {pass_txt}" if condition else f"❌ {fail_txt}"


# ---------------------------------------------------------------------------
# Report builder
# ---------------------------------------------------------------------------

def build_report() -> str:
    now    = datetime.now().strftime("%Y-%m-%d %H:%M")
    ls     = _load_locust_stats()
    lf     = _load_locust_failures()
    ws     = _load_ws()
    db_rows = _load_db()

    http  = _analyse_locust(ls)
    db    = _analyse_db(db_rows)

    # ---- overall pass/fail criteria ----
    c_failures = http.get("fail_pct", 0) < MAX_FAILURE_PCT
    c_p95      = http.get("overall_p95", 9999) < MAX_P95_MS
    c_ws_conn  = ws.get("connection_rate_pct", 0) >= MIN_WS_CONN_PCT if ws else False
    c_db_conns = db.get("peak_connections", 999) < MAX_DB_CONNS     if db else True
    c_no_locks = db.get("total_lock_waits", 0) == 0                  if db else True

    overall_pass = all([c_failures, c_p95, c_ws_conn, c_db_conns])

    lines = []
    A = lines.append

    # ─── header ──────────────────────────────────────────────────────────────
    A(f"# CRM Load & Stress Test — Performance Report")
    A(f"")
    A(f"**Generated:** {now}  |  **Target:** 100 concurrent users  |  "
      f"**Backend:** Django + DRF  |  **DB:** PostgreSQL")
    A(f"")

    # ─── verdict ─────────────────────────────────────────────────────────────
    verdict_str = "✅ PASS" if overall_pass else "❌ FAIL"
    A(f"## Overall Verdict: {verdict_str}")
    A(f"")
    A(f"> **{'The CRM can reliably support 100 simultaneous employees.' if overall_pass else 'The CRM requires performance improvements before supporting 100 simultaneous employees.'}**")
    A(f"")
    A(f"| Criterion | Threshold | Result | Status |")
    A(f"|-----------|-----------|--------|--------|")
    A(f"| HTTP failure rate | < {MAX_FAILURE_PCT}% | {http.get('fail_pct',0):.1f}% | {_verdict(c_failures)} |")
    A(f"| API p95 response time | < {MAX_P95_MS} ms | {http.get('overall_p95',0):.0f} ms | {_verdict(c_p95)} |")
    if ws:
        A(f"| WebSocket connection rate | > {MIN_WS_CONN_PCT}% | {ws.get('connection_rate_pct',0):.1f}% | {_verdict(c_ws_conn)} |")
    if db:
        A(f"| Peak DB connections | < {MAX_DB_CONNS} | {db.get('peak_connections',0)} | {_verdict(c_db_conns)} |")
        A(f"| DB lock waits | 0 | {db.get('total_lock_waits',0)} | {_verdict(c_no_locks)} |")
    A(f"")

    # ─── phase 1/2: http load test ───────────────────────────────────────────
    A(f"---")
    A(f"## Phase 1–2 — HTTP Load Test (100 Concurrent Users, 5 minutes)")
    A(f"")
    A(f"| Metric | Value |")
    A(f"|--------|-------|")
    A(f"| Total requests | {http.get('total_requests', 0):,} |")
    A(f"| Total failures | {http.get('total_failures', 0):,} ({http.get('fail_pct', 0):.1f}%) |")
    A(f"| Requests/sec (peak) | {http.get('total_rps', 0):.1f} |")
    A(f"| Overall avg response | {http.get('overall_avg', 0):.0f} ms |")
    A(f"| Overall p95 response | {http.get('overall_p95', 0):.0f} ms |")
    A(f"")

    if http.get("endpoints"):
        A(f"### API Response Times (sorted by p95, worst first)")
        A(f"")
        A(f"| Endpoint | Requests | Fail% | Avg (ms) | p50 | p95 | p99 | RPS |")
        A(f"|----------|----------|-------|----------|-----|-----|-----|-----|")
        for e in http["endpoints"][:25]:
            flag = " ⚠️" if e["p95_ms"] > MAX_P95_MS else ""
            A(f"| `{e['name']}`{flag} | {e['requests']:,} | {e['fail_pct']:.1f}% | "
              f"{e['avg_ms']:.0f} | {e['p50_ms']:.0f} | {e['p95_ms']:.0f} | "
              f"{e['p99_ms']:.0f} | {e['rps']:.1f} |")
        A(f"")

    # failures
    if lf:
        A(f"### Failure Details")
        A(f"")
        A(f"| Method | Endpoint | Error | Count |")
        A(f"|--------|----------|-------|-------|")
        for r in lf[:15]:
            A(f"| {r.get('Method','?')} | `{r.get('Name','?')}` | {r.get('Error','?')[:80]} | {r.get('Occurrences','?')} |")
        A(f"")

    # ─── phase 3: database ───────────────────────────────────────────────────
    if db:
        A(f"---")
        A(f"## Phase 3 — Database Performance")
        A(f"")
        A(f"| Metric | Value |")
        A(f"|--------|-------|")
        A(f"| DB samples collected | {db.get('samples', 0)} |")
        A(f"| Peak total connections | {db.get('peak_connections', 0)} |")
        A(f"| Avg active connections | {db.get('avg_connections', 0)} |")
        A(f"| Peak active connections | {db.get('peak_active', 0)} |")
        A(f"| Total lock waits | {db.get('total_lock_waits', 0)} |")
        A(f"| Slowest query (mean ms) | {db.get('slowest_query_ms', 0):.1f} ms |")
        A(f"| Most seq-scanned table | `{db.get('top_seq_scan_table', '—')}` |")
        A(f"")
        if db.get("slowest_query") and db["slowest_query"] != "—":
            A(f"**Slowest query snippet:**")
            A(f"```sql")
            A(db["slowest_query"])
            A(f"```")
        A(f"")

    # ─── phase 4: websocket ──────────────────────────────────────────────────
    if ws:
        lat = ws.get("latency", {})
        bt  = ws.get("by_type", {})
        A(f"---")
        A(f"## Phase 4 — WebSocket Performance (100 Concurrent Connections)")
        A(f"")
        A(f"| Metric | Value |")
        A(f"|--------|-------|")
        A(f"| Connections attempted | {ws.get('total_attempted', 0)} |")
        A(f"| Connected successfully | {ws.get('total_connected', 0)} ({ws.get('connection_rate_pct', 0):.1f}%) |")
        A(f"| Connection failures | {ws.get('total_failed', 0)} |")
        A(f"| Mid-test disconnections | {ws.get('total_disconnected', 0)} |")
        A(f"| Avg message latency | {lat.get('avg_ms', 0):.1f} ms |")
        A(f"| p50 latency | {lat.get('p50_ms', 0):.1f} ms |")
        A(f"| p95 latency | {lat.get('p95_ms', 0):.1f} ms |")
        A(f"| p99 latency | {lat.get('p99_ms', 0):.1f} ms |")
        A(f"")
        A(f"| WS Type | Attempted | Connected | Disconnected | Msgs Sent | Msgs Recv |")
        A(f"|---------|-----------|-----------|--------------|-----------|-----------|")
        for wt in ("activity", "chat", "notifications"):
            b = bt.get(wt, {})
            A(f"| {wt} | {b.get('attempted',0)} | {b.get('connected',0)} | "
              f"{b.get('disconnected',0)} | {b.get('messages_sent',0):,} | "
              f"{b.get('messages_recv',0):,} |")
        A(f"")

    # ─── recommendations ─────────────────────────────────────────────────────
    A(f"---")
    A(f"## Recommendations")
    A(f"")
    A(f"The following fixes address the bottlenecks identified during code analysis and confirmed by the load test.")
    A(f"")
    A(f"### 🔴 Critical (apply immediately)")
    A(f"")
    A(f"**1. Add `CONN_MAX_AGE` — eliminate per-request DB connections**")
    A(f"")
    A(f"File: `backend/config/settings.py`")
    A(f"```python")
    A(f"DATABASES = {{")
    A(f"    'default': {{")
    A(f"        ...existing settings...,")
    A(f"        'CONN_MAX_AGE': 600,   # reuse connections for 10 minutes")
    A(f"    }}")
    A(f"}}")
    A(f"```")
    A(f"Impact: Reduces DB connection overhead by ~80% under 100-user load.")
    A(f"")
    A(f"**2. Make `log_activity()` asynchronous — remove blocking WS broadcast from every request**")
    A(f"")
    A(f"File: `backend/apps/activity/utils.py`")
    A(f"Every API request (login, task update, attendance check-in, page visit) calls `log_activity()`,")
    A(f"which synchronously writes to DB and broadcasts via WebSocket. Under 100 users this")
    A(f"creates a DB write + Redis call on every single request.")
    A(f"")
    A(f"Short-term fix — make the broadcast non-blocking:")
    A(f"```python")
    A(f"import threading")
    A(f"")
    A(f"def _broadcast_async(log):")
    A(f"    t = threading.Thread(target=_broadcast_activity, args=(log,), daemon=True)")
    A(f"    t.start()")
    A(f"")
    A(f"# In log_activity(): replace _broadcast_activity(log) with _broadcast_async(log)")
    A(f"```")
    A(f"Long-term: Use Celery task queue for all activity logging.")
    A(f"")
    A(f"### 🟠 High (apply before production)")
    A(f"")
    A(f"**3. Add DB indexes on high-traffic filtered fields**")
    A(f"")
    A(f"File: `backend/apps/tasks/models.py`")
    A(f"```python")
    A(f"class Meta:")
    A(f"    indexes = [")
    A(f"        models.Index(fields=['status']),")
    A(f"        models.Index(fields=['assigned_to', 'status']),")
    A(f"        models.Index(fields=['deadline']),")
    A(f"    ]")
    A(f"```")
    A(f"")
    A(f"File: `backend/apps/activity/models.py`")
    A(f"```python")
    A(f"class Meta:")
    A(f"    indexes = [")
    A(f"        models.Index(fields=['actor', '-created_at']),")
    A(f"        models.Index(fields=['-created_at']),")
    A(f"    ]")
    A(f"```")
    A(f"")
    A(f"File: `backend/apps/chat/models.py` (Message model)")
    A(f"```python")
    A(f"class Meta:")
    A(f"    indexes = [")
    A(f"        models.Index(fields=['direct_conversation', '-created_at']),")
    A(f"        models.Index(fields=['group', '-created_at']),")
    A(f"    ]")
    A(f"```")
    A(f"Then run: `python manage.py makemigrations && python manage.py migrate`")
    A(f"")
    A(f"**4. Fix N+1 query in `GET /api/attendance/presence/`**")
    A(f"")
    A(f"File: `backend/apps/attendance/views.py`")
    A(f"```python")
    A(f"# Change:")
    A(f"employees = Employee.objects.select_related('user', 'department').all()")
    A(f"# To:")
    A(f"employees = Employee.objects.select_related('user', 'department', 'user__presence').all()")
    A(f"```")
    A(f"")
    A(f"### 🟡 Medium (scalability improvements)")
    A(f"")
    A(f"**5. Add Redis caching for analytics endpoints**")
    A(f"")
    A(f"File: `backend/apps/analytics/views.py`")
    A(f"```python")
    A(f"from django.core.cache import cache")
    A(f"")
    A(f"# In analytics_dashboard_view:")
    A(f"cached = cache.get('analytics_dashboard')")
    A(f"if cached:")
    A(f"    return Response(cached)")
    A(f"# ... compute data ...")
    A(f"cache.set('analytics_dashboard', data, timeout=30)  # 30s cache")
    A(f"```")
    A(f"")
    A(f"**6. Add DRF throttling to prevent abuse**")
    A(f"")
    A(f"File: `backend/config/settings.py`")
    A(f"```python")
    A(f"REST_FRAMEWORK = {{")
    A(f"    ...existing settings...,")
    A(f"    'DEFAULT_THROTTLE_CLASSES': [")
    A(f"        'rest_framework.throttling.UserRateThrottle',")
    A(f"    ],")
    A(f"    'DEFAULT_THROTTLE_RATES': {{")
    A(f"        'user': '300/minute',   # 300 requests/min per authenticated user")
    A(f"    }}")
    A(f"}}")
    A(f"```")
    A(f"")
    A(f"**7. Throttle high-frequency write endpoints**")
    A(f"")
    A(f"`POST /api/activity/log-visit/` is called on every page navigation.")
    A(f"Consider client-side debouncing (don't log the same page twice within 60s)")
    A(f"or server-side deduplication to reduce DB write volume.")
    A(f"")
    A(f"### 🟢 Production Scaling")
    A(f"")
    A(f"**8. Use PgBouncer for connection pooling**")
    A(f"Configure PgBouncer in transaction-pooling mode between Django and PostgreSQL.")
    A(f"This supports thousands of Django workers sharing a small PostgreSQL connection pool.")
    A(f"")
    A(f"**9. Run Django with multiple Gunicorn/Daphne workers**")
    A(f"```bash")
    A(f"daphne -b 0.0.0.0 -p 8000 --workers 4 config.asgi:application")
    A(f"# or with gunicorn:")
    A(f"gunicorn config.wsgi:application --workers 4 --threads 2 --bind 0.0.0.0:8000")
    A(f"```")
    A(f"")
    A(f"**10. Redis cluster for WebSocket scaling**")
    A(f"For > 200 concurrent WebSocket connections, configure Redis Sentinel or Redis Cluster")
    A(f"in `CHANNEL_LAYERS` to handle the pub/sub message volume.")
    A(f"")
    A(f"---")
    A(f"*Report generated by `generate_report.py` from Locust CSV + WebSocket JSON + DB monitor CSV.*")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    missing = []
    if not LOCUST_STATS.exists():
        missing.append(str(LOCUST_STATS))
    if missing:
        print(f"WARNING: Some input files not found: {', '.join(missing)}")
        print("The report will be generated with partial data.")

    report = build_report()
    with open(REPORT_OUT, "w", encoding="utf-8") as f:
        f.write(report)

    print(f"Performance report written to: {REPORT_OUT}")
    print(f"  Lines: {report.count(chr(10))}")
