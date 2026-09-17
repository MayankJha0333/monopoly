#!/usr/bin/env bash
# Pull the latest code from GitHub and restart the game.
# Run it from the project folder:   bash deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only
sudo docker compose -f docker-compose.prod.yml up -d --build
sudo docker image prune -f >/dev/null
sudo docker compose -f docker-compose.prod.yml ps
echo "Updated. Matches in progress end on a restart, so update when few people are playing."
