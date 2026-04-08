#!/bin/bash
# ============================================================
# UPDATE SCRIPT — Pull latest code from GitHub and redeploy
# Run this on the EC2 server whenever you push new code
# Usage: bash /home/ubuntu/promope-crm/deploy/update.sh
# ============================================================
set -e

APP_DIR="/home/ubuntu/promope-crm"
VENV_DIR="$APP_DIR/venv"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   Promope CRM — Updating...         ║"
echo "╚══════════════════════════════════════╝"
echo "Timestamp: $(date)"
echo ""

# ── 1. Pull latest code ───────────────────────────────────
echo ">>> [1/6] Pulling latest code from GitHub..."
cd "$APP_DIR"
git pull origin main
echo "    Done."

# ── 2. Activate virtualenv ────────────────────────────────
source "$VENV_DIR/bin/activate"

# ── 3. Install any new Python packages ───────────────────
echo ">>> [2/6] Updating Python packages..."
pip install -r "$BACKEND_DIR/requirements.txt" --quiet
echo "    Done."

# ── 4. Run migrations ─────────────────────────────────────
echo ">>> [3/6] Running migrations..."
cd "$BACKEND_DIR"
python manage.py migrate --noinput
echo "    Done."

# ── 5. Collect static files ───────────────────────────────
echo ">>> [4/6] Collecting static files..."
python manage.py collectstatic --noinput --clear
echo "    Done."

# ── 6. Rebuild frontend ───────────────────────────────────
echo ">>> [5/6] Rebuilding React frontend..."
cd "$FRONTEND_DIR"
npm install --legacy-peer-deps --silent
npm run build
echo "    Done."

# ── 7. Bump app version ───────────────────────────────────
echo ">>> [6/7] Bumping app version..."
cd "$BACKEND_DIR"
python manage.py shell -c "
from apps.notifications.models import AppVersion
latest = AppVersion.objects.filter(platform='android').order_by('-version_code').first()
code = (latest.version_code if latest else 0) + 1
name = f'1.{code}'
AppVersion.objects.create(
    platform='android',
    version_name=name,
    version_code=code,
    release_notes='New update available. Please refresh to get the latest features.',
    force_update=False,
)
print(f'    App version bumped to v{name} (code {code})')
"
echo "    Done."

# ── 8. Restart services ───────────────────────────────────
echo ">>> [7/7] Restarting services..."
sudo systemctl restart promope-crm
sudo systemctl reload nginx
sleep 2

# Status check
sudo systemctl is-active --quiet promope-crm && \
    echo "    Daphne: RUNNING ✅" || \
    echo "    Daphne: FAILED ❌ — run: sudo journalctl -u promope-crm -n 30"

sudo systemctl is-active --quiet nginx && \
    echo "    Nginx:  RUNNING ✅" || \
    echo "    Nginx:  FAILED ❌ — run: sudo nginx -t"

echo ""
echo "✅ Update complete!"
echo "   App: http://3.110.120.55"
echo ""
