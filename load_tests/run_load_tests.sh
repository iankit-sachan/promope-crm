#!/usr/bin/env bash
# =============================================================================
# CRM Load Test Runner
# Run via Git Bash or WSL on Windows.
#
# Steps:
#   1. Seed test data
#   2. Start DB monitor in background
#   3. Run Locust headless (100 users, 5 min)
#   4. Run WebSocket concurrency test (60s)
#   5. Generate performance report
#
# Usage:
#   bash run_load_tests.sh
#   bash run_load_tests.sh --reseed    # clear and reseed test data first
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/../backend" && pwd)"

# ── Config ────────────────────────────────────────────────────────────────────
DB_NAME="${DB_NAME:-crm_db}"
DB_USER="${DB_USER:-postgres}"
DB_PASS="${DB_PASS:-password}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

LOCUST_USERS="${LOCUST_USERS:-100}"
LOCUST_SPAWN="${LOCUST_SPAWN:-10}"
LOCUST_TIME="${LOCUST_TIME:-5m}"
WS_DURATION="${WS_DURATION:-60}"
MONITOR_DURATION=430   # 5 min test + 30s buffer

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; NC='\033[0m'

log()  { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Cleanup ───────────────────────────────────────────────────────────────────
MONITOR_PID=""
cleanup() {
    [[ -n "${MONITOR_PID}" ]] && kill "${MONITOR_PID}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ── Dependency check ──────────────────────────────────────────────────────────
log "Checking dependencies..."
command -v python >/dev/null 2>&1  || err "Python not found"
command -v locust >/dev/null 2>&1  || err "Locust not installed. Run: pip install locust"
python -c "import psycopg2"  >/dev/null 2>&1 || { warn "psycopg2 missing — DB monitor skipped"; SKIP_DB=1; }
python -c "import websockets" >/dev/null 2>&1 || { warn "websockets missing — WS test skipped"; SKIP_WS=1; }
python -c "import aiohttp"    >/dev/null 2>&1 || { warn "aiohttp missing — WS test skipped";    SKIP_WS=1; }

# ── Step 1: Seed ──────────────────────────────────────────────────────────────
log "=== STEP 1: Test data ==="
SEED_FLAG=""
[[ "${1:-}" == "--reseed" ]] && SEED_FLAG="--clear"

if [[ -f "${SCRIPT_DIR}/test_users.json" && -z "${SEED_FLAG}" ]]; then
    warn "test_users.json already exists — skipping seed. Pass --reseed to force."
else
    (cd "${BACKEND_DIR}" && python manage.py seed_load_test_data ${SEED_FLAG})
fi
[[ -f "${SCRIPT_DIR}/test_users.json" ]] || err "test_users.json was not created."
ok "Test data ready."

# ── Step 2: DB Monitor ────────────────────────────────────────────────────────
log "=== STEP 2: DB monitor ==="
if [[ "${SKIP_DB:-0}" == "1" ]]; then
    warn "Skipping DB monitor."
else
    python "${SCRIPT_DIR}/monitor_db.py" \
        --dbname   "${DB_NAME}" \
        --user     "${DB_USER}" \
        --password "${DB_PASS}" \
        --host     "${DB_HOST}" \
        --port     "${DB_PORT}" \
        --interval 5 \
        --duration "${MONITOR_DURATION}" \
        > "${SCRIPT_DIR}/db_monitor.log" 2>&1 &
    MONITOR_PID=$!
    sleep 2
    kill -0 "${MONITOR_PID}" 2>/dev/null && ok "DB monitor running (PID ${MONITOR_PID})" || warn "DB monitor failed to start"
fi

# ── Step 3: Locust ────────────────────────────────────────────────────────────
log "=== STEP 3: HTTP load test (${LOCUST_USERS} users × ${LOCUST_TIME}) ==="
(
    cd "${SCRIPT_DIR}"
    locust \
        -f locustfile.py \
        --headless \
        --host="http://localhost:8000" \
        -u "${LOCUST_USERS}" \
        -r "${LOCUST_SPAWN}" \
        --run-time "${LOCUST_TIME}" \
        --csv=locust_stats \
        --html=locust_report.html \
        --only-summary 2>&1 | tee locust_output.log
)
ok "Locust finished → locust_stats*.csv + locust_report.html"

# ── Step 4: WebSocket test ────────────────────────────────────────────────────
log "=== STEP 4: WebSocket test (100 connections × ${WS_DURATION}s) ==="
if [[ "${SKIP_WS:-0}" == "1" ]]; then
    warn "Skipping WS test."
else
    python "${SCRIPT_DIR}/ws_load_test.py" --duration "${WS_DURATION}" 2>&1 | tee ws_output.log
    ok "WS test finished → ws_results.json"
fi

# ── Step 5: Stop monitor ──────────────────────────────────────────────────────
[[ -n "${MONITOR_PID}" ]] && { kill "${MONITOR_PID}" 2>/dev/null; MONITOR_PID=""; }

# ── Step 6: Generate report ───────────────────────────────────────────────────
log "=== STEP 5: Generating performance report ==="
python "${SCRIPT_DIR}/generate_report.py"
ok "Report generated → ${SCRIPT_DIR}/performance_report.md"

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  LOAD TEST COMPLETE${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo "  HTTP report:   ${SCRIPT_DIR}/locust_report.html"
echo "  Performance:   ${SCRIPT_DIR}/performance_report.md"
echo "  DB metrics:    ${SCRIPT_DIR}/db_monitor.csv"
echo "  WS results:    ${SCRIPT_DIR}/ws_results.json"
