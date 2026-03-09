#!/bin/bash
# ============================================================
# SCRIPT 2 — App deployment
# Run this AFTER 1_server_setup.sh
# Usage: bash 2_app_deploy.sh
# ============================================================
set -e

APP_DIR="/home/ubuntu/promope-crm"
REPO_URL="https://YOUR_GITHUB_PAT@github.com/iankit-sachan/promope-crm.git"
VENV_DIR="$APP_DIR/venv"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   Promope CRM — App Deployment                  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── 1. Clone repository ───────────────────────────────────
echo ">>> [1/9] Cloning GitHub repository..."
if [ -d "$APP_DIR/.git" ]; then
    echo "    Repo already exists — pulling latest..."
    cd "$APP_DIR"
    git pull origin main
else
    git clone "$REPO_URL" "$APP_DIR"
fi
echo "    Done."

# ── 2. Create Python virtual environment ──────────────────
echo ">>> [2/9] Creating Python virtual environment..."
python3 -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"
pip install --upgrade pip
echo "    Virtual env ready at $VENV_DIR"

# ── 3. Install Python dependencies ────────────────────────
echo ">>> [3/9] Installing Python packages..."
pip install -r "$BACKEND_DIR/requirements.txt"
echo "    Requirements installed."

# ── 4. Create production .env ─────────────────────────────
echo ">>> [4/9] Creating backend .env file..."
if [ ! -f "$BACKEND_DIR/.env" ]; then
cat > "$BACKEND_DIR/.env" <<ENV
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(50))")
DEBUG=False
ALLOWED_HOSTS=3.110.120.55,localhost,127.0.0.1

# Database
DB_NAME=crm_db
DB_USER=crm_user
DB_PASSWORD=CRM_Prod@2024
DB_HOST=localhost
DB_PORT=5432

# Redis (WebSockets)
REDIS_URL=redis://localhost:6379/0

# JWT
ACCESS_TOKEN_LIFETIME_MINUTES=60
REFRESH_TOKEN_LIFETIME_DAYS=7

# CORS — allow requests from EC2 IP
CORS_ALLOWED_ORIGINS=http://3.110.120.55

# SSL — False because we are HTTP only (no SSL cert yet)
SECURE_SSL_REDIRECT=False
ENV
    echo "    .env created."
else
    echo "    .env already exists — skipping (edit manually if needed)."
fi

# ── 5. Run Django migrations ──────────────────────────────
echo ">>> [5/9] Running Django migrations..."
cd "$BACKEND_DIR"
python manage.py migrate --noinput
echo "    Migrations done."

# ── 6. Collect static files ───────────────────────────────
echo ">>> [6/9] Collecting static files..."
python manage.py collectstatic --noinput
echo "    Static files collected to $BACKEND_DIR/staticfiles/"

# ── 7. Build Vite frontend ────────────────────────────────
echo ">>> [7/9] Building React frontend..."
cd "$FRONTEND_DIR"
npm install --legacy-peer-deps
npm run build
echo "    Frontend built at $FRONTEND_DIR/dist/"

# ── 8. Install and enable systemd service ─────────────────
echo ">>> [8/9] Installing systemd service..."
sudo cp "$APP_DIR/deploy/promope-crm.service" /etc/systemd/system/promope-crm.service
sudo systemctl daemon-reload
sudo systemctl enable promope-crm
sudo systemctl restart promope-crm
sleep 2
sudo systemctl status promope-crm --no-pager
echo "    Daphne service running."

# ── 9. Install and enable Nginx ───────────────────────────
echo ">>> [9/9] Configuring Nginx..."
sudo cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/promope-crm
sudo ln -sf /etc/nginx/sites-available/promope-crm /etc/nginx/sites-enabled/promope-crm
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
echo "    Nginx configured."

echo ""
echo "✅ Deployment complete!"
echo ""
echo "   App URL:   http://3.110.120.55"
echo "   API:       http://3.110.120.55/api/"
echo "   Admin:     http://3.110.120.55/admin/"
echo ""
echo "   To create a superuser (admin panel access):"
echo "   cd $BACKEND_DIR && source $VENV_DIR/bin/activate"
echo "   python manage.py createsuperuser"
echo ""
