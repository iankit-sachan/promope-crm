#!/bin/bash
set -e

APP_DIR=/home/ubuntu/promope-crm
VENV_DIR=/home/ubuntu/promope-crm/venv
BACKEND_DIR=/home/ubuntu/promope-crm/backend
FRONTEND_DIR=/home/ubuntu/promope-crm/frontend

echo ""
echo "========================================"
echo "  Promope CRM - App Deployment"
echo "========================================"
echo ""

# ── 1. Python virtualenv ──────────────────────
echo ">>> [1/7] Setting up Python virtualenv..."
python3 -m venv $VENV_DIR
source $VENV_DIR/bin/activate
pip install --upgrade pip -q
echo "Done."

# ── 2. Python packages ────────────────────────
echo ">>> [2/7] Installing Python packages..."
pip install -r $BACKEND_DIR/requirements.txt -q
echo "Done."

# ── 3. Production .env ────────────────────────
echo ">>> [3/7] Creating production .env..."
if [ ! -f $BACKEND_DIR/.env ]; then
  SECRET=$(python3 -c 'import secrets; print(secrets.token_urlsafe(50))')
  cat > $BACKEND_DIR/.env <<ENVFILE
SECRET_KEY=${SECRET}
DEBUG=False
ALLOWED_HOSTS=3.110.120.55,localhost,127.0.0.1
DB_NAME=crm_db
DB_USER=crm_user
DB_PASSWORD=StrongPassword123
DB_HOST=localhost
DB_PORT=5432
REDIS_URL=redis://localhost:6379/0
ACCESS_TOKEN_LIFETIME_MINUTES=60
REFRESH_TOKEN_LIFETIME_DAYS=7
CORS_ALLOWED_ORIGINS=http://3.110.120.55
SECURE_SSL_REDIRECT=False
ENVFILE
  echo ".env created."
else
  echo ".env already exists - skipping."
fi

# ── 4. Django migrations ──────────────────────
echo ">>> [4/7] Running Django migrations..."
cd $BACKEND_DIR
$VENV_DIR/bin/python manage.py migrate --noinput
echo "Done."

# ── 5. Collect static files ───────────────────
echo ">>> [5/7] Collecting static files..."
$VENV_DIR/bin/python manage.py collectstatic --noinput
echo "Done."

# ── 6. Build React frontend ───────────────────
echo ">>> [6/7] Building React frontend..."
cd $FRONTEND_DIR
npm install --legacy-peer-deps
npm run build
echo "Done."

# ── 7. Systemd + Nginx ────────────────────────
echo ">>> [7/7] Installing systemd service and Nginx config..."
sudo mkdir -p /var/log/promope-crm
sudo chown ubuntu:ubuntu /var/log/promope-crm

# Convert deploy files to unix line endings
dos2unix $APP_DIR/deploy/promope-crm.service 2>/dev/null || true
dos2unix $APP_DIR/deploy/nginx.conf 2>/dev/null || true

sudo cp $APP_DIR/deploy/promope-crm.service /etc/systemd/system/promope-crm.service
sudo systemctl daemon-reload
sudo systemctl enable promope-crm
sudo systemctl restart promope-crm
sleep 3

sudo cp $APP_DIR/deploy/nginx.conf /etc/nginx/sites-available/promope-crm
sudo ln -sf /etc/nginx/sites-available/promope-crm /etc/nginx/sites-enabled/promope-crm
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "========================================"
echo "  Status Check"
echo "========================================"
sudo systemctl is-active --quiet promope-crm && echo "  Daphne : RUNNING" || echo "  Daphne : FAILED"
sudo systemctl is-active --quiet nginx       && echo "  Nginx  : RUNNING" || echo "  Nginx  : FAILED"
sudo systemctl is-active --quiet postgresql  && echo "  Postgres: RUNNING" || echo "  Postgres: FAILED"
sudo systemctl is-active --quiet redis-server && echo "  Redis  : RUNNING" || echo "  Redis  : FAILED"

echo ""
echo "Deployment complete!"
echo "App URL: http://3.110.120.55"
echo ""
