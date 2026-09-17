#!/usr/bin/env bash
# Move the VM to a new version of the game and restart it.
#   bash deploy/update.sh            # latest main from GitHub
#   bash deploy/update.sh <commit>   # a specific commit (used by GitHub Actions; also a rollback)
# The old version keeps running until the new one has built.
set -euo pipefail
cd "$(dirname "$0")/.."

REF="${1:-origin/main}"
COMPOSE="sudo docker compose -f docker-compose.prod.yml"
DOMAIN=$(grep -s '^DOMAIN=' .env | cut -d= -f2- || true)
DOMAIN="${DOMAIN:-rentrush.in}"

echo "==> Fetching $REF"
git fetch --prune --quiet origin
git reset --hard --quiet "$REF"
git log -1 --format='    %h %s (%an, %ar)'

echo "==> Building"
$COMPOSE build app

echo "==> Restarting"
$COMPOSE up -d --remove-orphans

echo "==> Waiting for the game to answer"
for _ in $(seq 1 30); do
  if curl -fsS --max-time 5 "https://$DOMAIN/healthz" >/dev/null 2>&1; then
    sudo docker image prune -f >/dev/null
    $COMPOSE ps
    echo "Updated: https://$DOMAIN is live on $(git rev-parse --short HEAD)."
    exit 0
  fi
  sleep 3
done
$COMPOSE ps
$COMPOSE logs app --tail 40
echo "!! https://$DOMAIN/healthz did not answer after the update."
exit 1
