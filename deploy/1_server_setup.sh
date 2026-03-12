#!/bin/bash
# ============================================================
# SCRIPT 1 — One-time server setup
# Run this ONCE on a fresh Ubuntu 24.04 EC2 instance
# Usage: bash 1_server_setup.sh
# ============================================================
set -e  # Exit immediately on any error

EC2_IP="3.110.120.55"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   Promope CRM — Server Setup (Ubuntu 24.04)     ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── 1. System update ──────────────────────────────────────
echo ">>> [1/8] Updating system packages..."
sudo apt update -y && sudo apt upgrade -y

# ── 2. Core packages ──────────────────────────────────────
echo ">>> [2/8] Installing core packages..."
sudo apt install -y \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    postgresql \
    postgresql-contrib \
    libpq-dev \
    nginx \
    git \
    curl \
    build-essential \
    redis-server \
    supervisor

# ── 3. Node.js 20 (LTS) ───────────────────────────────────
echo ">>> [3/8] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
echo "Node version: $(node -v)"
echo "NPM version:  $(npm -v)"

# ── 4. PostgreSQL ─────────────────────────────────────────
echo ">>> [4/8] Configuring PostgreSQL..."
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create DB user and database
sudo -u postgres psql <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm_user') THEN
    CREATE USER crm_user WITH PASSWORD 'StrongPassword123';
  END IF;
END
\$\$;

SELECT 'CREATE DATABASE crm_db OWNER crm_user'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'crm_db')\gexec

GRANT ALL PRIVILEGES ON DATABASE crm_db TO crm_user;
ALTER DATABASE crm_db OWNER TO crm_user;
SQL

echo "PostgreSQL: crm_db and crm_user created."

# ── 5. Redis ──────────────────────────────────────────────
echo ">>> [5/8] Configuring Redis..."
sudo systemctl start redis-server
sudo systemctl enable redis-server
redis-cli ping  # Should print PONG

# ── 6. Firewall (UFW) ─────────────────────────────────────
echo ">>> [6/8] Configuring firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'   # allows port 80 and 443
sudo ufw allow 8000/tcp       # Daphne direct access (optional, for testing)
sudo ufw --force enable
sudo ufw status

# ── 7. Create app directory ───────────────────────────────
echo ">>> [7/8] Creating app directory..."
sudo mkdir -p /home/ubuntu/promope-crm
sudo chown ubuntu:ubuntu /home/ubuntu/promope-crm

# ── 8. Version check ──────────────────────────────────────
echo ">>> [8/8] Final version check..."
echo "Python:     $(python3 --version)"
echo "pip:        $(pip3 --version)"
echo "Node:       $(node -v)"
echo "npm:        $(npm -v)"
echo "PostgreSQL: $(psql --version)"
echo "Nginx:      $(nginx -v 2>&1)"
echo "Redis:      $(redis-server --version)"
echo "Git:        $(git --version)"

echo ""
echo "✅ Server setup complete!"
echo "   Now run: bash 2_app_deploy.sh"
echo ""
