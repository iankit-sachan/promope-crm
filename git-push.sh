#!/usr/bin/env bash
# PromoPe CRM — quick commit & push helper
# Usage:
#   ./git-push.sh                          (uses default message with timestamp)
#   ./git-push.sh "Fix dashboard stats"    (custom message)

set -e

cd "$(dirname "$0")"

MSG="${1:-"Update: $(date +'%Y-%m-%d %H:%M')"}"

echo "📦 Staging changes..."
git add .

# Exit cleanly if nothing to commit
if git diff --cached --quiet; then
  echo "✅ Nothing to commit — working tree clean."
  exit 0
fi

echo "💾 Committing: $MSG"
git commit -m "$MSG"

if git remote get-url origin &>/dev/null; then
  echo "🚀 Pushing to GitHub..."
  git push
  echo "✅ Done! Code pushed to GitHub."
else
  echo "⚠️  No remote 'origin' configured. Skipping push."
  echo "   Run: git remote add origin https://github.com/YOUR_USERNAME/promope-crm.git"
fi
