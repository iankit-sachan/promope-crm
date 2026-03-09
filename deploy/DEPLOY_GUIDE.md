# Promope CRM — AWS EC2 Deployment Guide

**Server:** Ubuntu 24.04 | **IP:** 3.110.120.55
**Stack:** Django Channels + Daphne + PostgreSQL + Redis + Nginx + React (Vite)

---

## Prerequisites (do this on your local Windows machine)

### 1. Fix .pem key permissions (run once in PowerShell as Administrator)
```powershell
icacls "C:\Users\ankit\Downloads\CRM.pem" /inheritance:r
icacls "C:\Users\ankit\Downloads\CRM.pem" /grant:r "$($env:USERNAME):(R)"
```

### 2. Get a GitHub Personal Access Token (PAT)
1. Go to: https://github.com/settings/tokens
2. Click **Generate new token (classic)**
3. Give it `repo` scope
4. Copy the token (starts with `ghp_...`)

---

## Step 1 — SSH into EC2

```bash
ssh -i "C:\Users\ankit\Downloads\CRM.pem" ubuntu@3.110.120.55
```

---

## Step 2 — Upload deploy scripts to server

Run this on your **local machine** (Git Bash or PowerShell):
```bash
scp -i "C:\Users\ankit\Downloads\CRM.pem" -r F:/CRM/deploy ubuntu@3.110.120.55:/home/ubuntu/
```

---

## Step 3 — Run server setup (inside EC2)

```bash
cd /home/ubuntu/deploy
chmod +x 1_server_setup.sh 2_app_deploy.sh update.sh
bash 1_server_setup.sh
```

This installs: Python 3, pip, venv, PostgreSQL, Nginx, Node.js 20, Git, Redis, Gunicorn, Daphne

---

## Step 4 — Set your GitHub PAT in deploy script

```bash
nano /home/ubuntu/deploy/2_app_deploy.sh
```
Find this line and replace `YOUR_GITHUB_PAT` with your actual token:
```
REPO_URL="https://YOUR_GITHUB_PAT@github.com/iankit-sachan/promope-crm.git"
```
Save: `Ctrl+O` → `Enter` → `Ctrl+X`

---

## Step 5 — Run app deployment

```bash
bash /home/ubuntu/deploy/2_app_deploy.sh
```

This will:
- Clone the GitHub repo
- Create Python virtual environment
- Install all requirements
- Create production `.env`
- Run Django migrations
- Collect static files
- Build the Vite React frontend
- Install and start Daphne as a systemd service
- Configure and reload Nginx

---

## Step 6 — Create log directory (first time only)

```bash
sudo mkdir -p /var/log/promope-crm
sudo chown ubuntu:ubuntu /var/log/promope-crm
```

---

## Step 7 — Verify everything is running

```bash
# Check Daphne service
sudo systemctl status promope-crm

# Check Nginx
sudo systemctl status nginx

# Check PostgreSQL
sudo systemctl status postgresql

# Check Redis
sudo systemctl status redis-server

# Check ports listening
sudo ss -tlnp | grep -E '80|8000|5432|6379'
```

---

## Step 8 — Open in browser

```
http://3.110.120.55
```

- Frontend (React): `http://3.110.120.55`
- API:              `http://3.110.120.55/api/`
- Django Admin:     `http://3.110.120.55/admin/`

---

## Updating after pushing new code

Run this on the EC2 server:
```bash
bash /home/ubuntu/promope-crm/deploy/update.sh
```

Or from your local machine in one command:
```bash
ssh -i "C:\Users\ankit\Downloads\CRM.pem" ubuntu@3.110.120.55 "bash /home/ubuntu/promope-crm/deploy/update.sh"
```

---

## AWS Security Group Settings

In AWS Console → EC2 → Your Instance → Security Groups → Inbound Rules, ensure these rules exist:

| Type       | Protocol | Port | Source    |
|------------|----------|------|-----------|
| SSH        | TCP      | 22   | Your IP   |
| HTTP       | TCP      | 80   | 0.0.0.0/0 |
| HTTPS      | TCP      | 443  | 0.0.0.0/0 |
| Custom TCP | TCP      | 8000 | Your IP   |

---

## Troubleshooting

### App not loading in browser
```bash
# Check if Daphne is running
sudo systemctl status promope-crm

# View Daphne logs (last 50 lines)
sudo journalctl -u promope-crm -n 50 --no-pager

# Check Nginx error log
sudo tail -50 /var/log/nginx/promope-crm.error.log

# Test Nginx config
sudo nginx -t
```

### 502 Bad Gateway
```bash
# Daphne crashed — check logs and restart
sudo journalctl -u promope-crm -n 30 --no-pager
sudo systemctl restart promope-crm
```

### Database connection error
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test connection manually
sudo -u postgres psql -c "\l"   # list databases
sudo -u postgres psql -c "\du"  # list users

# Verify crm_db exists
sudo -u postgres psql -c "SELECT datname FROM pg_database WHERE datname='crm_db';"
```

### Static files not loading (CSS/JS broken)
```bash
cd /home/ubuntu/promope-crm/backend
source /home/ubuntu/promope-crm/venv/bin/activate
python manage.py collectstatic --noinput

# Check files exist
ls /home/ubuntu/promope-crm/backend/staticfiles/
```

### Frontend shows blank page
```bash
# Check if dist/ exists
ls /home/ubuntu/promope-crm/frontend/dist/

# Rebuild if missing
cd /home/ubuntu/promope-crm/frontend
npm run build
```

### WebSockets not connecting (live feed / chat broken)
```bash
# Check Redis is running
sudo systemctl status redis-server
redis-cli ping  # should return PONG

# Check REDIS_URL in .env
cat /home/ubuntu/promope-crm/backend/.env | grep REDIS_URL
```

### Restart all services at once
```bash
sudo systemctl restart postgresql redis-server promope-crm nginx
```

---

## File Locations on EC2

| File | Path |
|------|------|
| App code | `/home/ubuntu/promope-crm/` |
| Backend `.env` | `/home/ubuntu/promope-crm/backend/.env` |
| Frontend build | `/home/ubuntu/promope-crm/frontend/dist/` |
| Static files | `/home/ubuntu/promope-crm/backend/staticfiles/` |
| Media uploads | `/home/ubuntu/promope-crm/backend/media/` |
| systemd service | `/etc/systemd/system/promope-crm.service` |
| Nginx config | `/etc/nginx/sites-available/promope-crm` |
| Daphne logs | `/var/log/promope-crm/access.log` |
| Nginx logs | `/var/log/nginx/promope-crm.*.log` |
