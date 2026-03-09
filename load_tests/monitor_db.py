"""
PostgreSQL performance monitor for CRM load tests.

Samples key DB metrics every N seconds and writes them to db_monitor.csv.
Also prints a live terminal dashboard.

Usage:
    python monitor_db.py
    python monitor_db.py --interval 5 --duration 400
    python monitor_db.py --dbname crm_db --user postgres --password password

Prerequisites:
    pip install psycopg2-binary>=2.9.0
"""

import argparse
import csv
import datetime
import os
import sys
import time
from pathlib import Path

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERROR: psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)

OUTPUT_FILE = Path(__file__).parent / "db_monitor.csv"

# ---------------------------------------------------------------------------
# SQL Queries
# ---------------------------------------------------------------------------

SQL_CONNECTIONS = """
SELECT
    COUNT(*)                                              AS total,
    COUNT(*) FILTER (WHERE state = 'active')              AS active,
    COUNT(*) FILTER (WHERE state = 'idle')                AS idle,
    COUNT(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_tx,
    COUNT(*) FILTER (WHERE wait_event_type = 'Lock')      AS lock_waits
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid();
"""

SQL_SEQ_SCANS = """
SELECT
    relname                                                       AS table_name,
    seq_scan,
    idx_scan,
    n_live_tup                                                    AS live_rows,
    CASE WHEN (seq_scan + idx_scan) > 0
         THEN ROUND(seq_scan::numeric / (seq_scan + idx_scan) * 100, 1)
         ELSE 0 END                                               AS seq_pct
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND n_live_tup > 0
ORDER BY seq_scan DESC
LIMIT 15;
"""

SQL_SLOW_QUERIES = """
SELECT
    LEFT(query, 120)                        AS query_snippet,
    calls,
    ROUND(mean_exec_time::numeric, 2)       AS mean_ms,
    ROUND(max_exec_time::numeric, 2)        AS max_ms,
    ROUND(total_exec_time::numeric, 2)      AS total_ms,
    rows
FROM pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
  AND calls > 3
ORDER BY mean_exec_time DESC
LIMIT 10;
"""

SQL_LOCK_WAITS = """
SELECT COUNT(*) AS lock_waits
FROM pg_locks l
JOIN pg_stat_activity a ON a.pid = l.pid
WHERE NOT l.granted
  AND a.datname = current_database();
"""

SQL_CHECK_PG_STAT = """
SELECT COUNT(*) FROM pg_available_extensions
WHERE name = 'pg_stat_statements'
  AND installed_version IS NOT NULL;
"""

SQL_RESET_SEQ_STATS = """
SELECT pg_stat_reset();
"""

# ---------------------------------------------------------------------------
# Monitor
# ---------------------------------------------------------------------------

CSV_HEADERS = [
    "timestamp", "total_connections", "active_connections",
    "idle_connections", "idle_in_tx", "lock_waits",
    "top_seq_scan_table", "top_seq_scan_count", "seq_scan_pct",
    "slowest_query_ms", "slowest_query_snippet", "lock_wait_count",
]


class DBMonitor:
    def __init__(self, dsn: str, interval: int = 5):
        self.dsn       = dsn
        self.interval  = interval
        self.conn      = None
        self.has_stats = False   # pg_stat_statements extension
        self._n        = 0

        self._csv_fh = open(OUTPUT_FILE, "w", newline="", encoding="utf-8")
        self._writer = csv.DictWriter(self._csv_fh, fieldnames=CSV_HEADERS)
        self._writer.writeheader()

    def connect(self):
        self.conn = psycopg2.connect(self.dsn)
        self.conn.set_session(readonly=True, autocommit=True)

        cur = self.conn.cursor()
        cur.execute(SQL_CHECK_PG_STAT)
        self.has_stats = bool(cur.fetchone()[0])
        cur.close()

        if not self.has_stats:
            print(
                "\nWARNING: pg_stat_statements extension not found.\n"
                "  Enable: CREATE EXTENSION pg_stat_statements;\n"
                "  Add to postgresql.conf: shared_preload_libraries = 'pg_stat_statements'\n"
                "  Slow query monitoring will be skipped.\n"
            )

    def _q(self, sql: str) -> list:
        try:
            cur = self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(sql)
            rows = [dict(r) for r in cur.fetchall()]
            cur.close()
            return rows
        except psycopg2.Error:
            try:
                self.connect()
            except Exception:
                pass
            return []

    def sample(self) -> dict:
        self._n += 1
        now = datetime.datetime.now()

        # --- connections ---
        cr = self._q(SQL_CONNECTIONS)
        c  = cr[0] if cr else {}
        total     = c.get("total", 0)
        active    = c.get("active", 0)
        idle      = c.get("idle", 0)
        idle_tx   = c.get("idle_in_tx", 0)
        lock_wait = c.get("lock_waits", 0)

        # --- sequential scans ---
        seq_rows = self._q(SQL_SEQ_SCANS)
        top_table = top_seq = top_pct = ""
        if seq_rows:
            top = seq_rows[0]
            top_table = top["table_name"]
            top_seq   = top["seq_scan"]
            top_pct   = top["seq_pct"]

        # --- slow queries ---
        slow_rows = self._q(SQL_SLOW_QUERIES) if self.has_stats else []
        slow_ms   = slow_rows[0]["mean_ms"] if slow_rows else 0.0
        slow_q    = slow_rows[0]["query_snippet"][:80] if slow_rows else ""

        # --- lock waits ---
        lwr = self._q(SQL_LOCK_WAITS)
        lock_count = lwr[0]["lock_waits"] if lwr else 0

        # print dashboard
        self._dashboard(now, total, active, idle, idle_tx, lock_wait,
                        seq_rows, slow_rows, lock_count)

        # write CSV
        self._writer.writerow({
            "timestamp":            now.isoformat(),
            "total_connections":    total,
            "active_connections":   active,
            "idle_connections":     idle,
            "idle_in_tx":           idle_tx,
            "lock_waits":           lock_wait,
            "top_seq_scan_table":   top_table,
            "top_seq_scan_count":   top_seq,
            "seq_scan_pct":         top_pct,
            "slowest_query_ms":     slow_ms,
            "slowest_query_snippet": slow_q,
            "lock_wait_count":      lock_count,
        })
        self._csv_fh.flush()

        return {"total_connections": total, "active": active}

    def _dashboard(self, now, total, active, idle, idle_tx, lock_wait,
                   seq_rows, slow_rows, lock_count):
        if self._n > 1:
            os.system("cls" if os.name == "nt" else "clear")

        print(f"DB Monitor  |  {now.strftime('%H:%M:%S')}  |  Sample #{self._n}")
        print("=" * 72)
        print(f"Connections:  total={total}  active={active}  idle={idle}  "
              f"idle-in-tx={idle_tx}  lock-wait={lock_wait}")
        print()

        print(f"  {'Table':<28} {'Seq Scans':>10} {'Idx Scans':>10} "
              f"{'Live Rows':>10}  Seq%")
        print("  " + "-" * 64)
        for r in seq_rows[:10]:
            print(f"  {r['table_name']:<28} {r['seq_scan']:>10,} "
                  f"{r['idx_scan']:>10,} {r['live_rows']:>10,}  "
                  f"{r['seq_pct']:>5.1f}%")

        if slow_rows:
            print()
            print(f"  {'Mean ms':>8}  {'Max ms':>8}  {'Calls':>8}  Query (120 chars)")
            print("  " + "-" * 72)
            for r in slow_rows[:5]:
                q = (r.get("query_snippet") or "")[:64].replace("\n", " ")
                print(f"  {r['mean_ms']:>8.2f}  {r['max_ms']:>8.2f}  "
                      f"{r['calls']:>8,}  {q}")

        print()
        print(f"Active lock waits: {lock_count}  |  Output: {OUTPUT_FILE}")

    def run(self, duration: int | None = None):
        self.connect()
        print(f"Connected. Sampling every {self.interval}s.  Ctrl-C to stop.")
        start = time.monotonic()
        try:
            while True:
                self.sample()
                elapsed = time.monotonic() - start
                if duration and elapsed >= duration:
                    break
                time.sleep(self.interval)
        except KeyboardInterrupt:
            print("\nMonitor stopped.")
        finally:
            self._csv_fh.close()
            if self.conn:
                try:
                    self.conn.close()
                except Exception:
                    pass
            print(f"Results written to {OUTPUT_FILE}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="PostgreSQL monitor for CRM load test")
    ap.add_argument("--dbname",   default="crm_db")
    ap.add_argument("--user",     default="postgres")
    ap.add_argument("--password", default="password")
    ap.add_argument("--host",     default="localhost")
    ap.add_argument("--port",     default="5432")
    ap.add_argument("--interval", type=int, default=5, help="Sample interval (seconds)")
    ap.add_argument("--duration", type=int, default=None,
                    help="Total duration seconds (default: run until Ctrl-C)")
    args = ap.parse_args()

    dsn = (f"dbname={args.dbname} user={args.user} password={args.password} "
           f"host={args.host} port={args.port}")

    DBMonitor(dsn=dsn, interval=args.interval).run(duration=args.duration)
