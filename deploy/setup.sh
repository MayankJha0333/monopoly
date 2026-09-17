#!/usr/bin/env bash
# One-time setup on a fresh Google Cloud VM (Ubuntu or Debian).
# Run it from the project folder:   bash deploy/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

DOMAIN="${DOMAIN:-rentrush.in}"
say() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }

say "Saving settings (.env)"
[ -f .env ] || echo "DOMAIN=$DOMAIN" > .env
cat .env

say "Adding 2 GB of swap (spare memory for the build)"
if ! swapon --show | grep -q '/swapfile'; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi
free -h | head -3

say "Installing Docker"
if ! command -v docker >/dev/null; then
  . /etc/os-release
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
sudo systemctl enable --now docker
sudo docker --version

say "Checking that $DOMAIN points to this VM"
MY_IP=$(curl -fsS -H 'Metadata-Flavor: Google' \
  http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip 2>/dev/null || true)
DNS_IP=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)
echo "This VM: ${MY_IP:-unknown}   $DOMAIN: ${DNS_IP:-not found}"
if [ -n "$MY_IP" ] && [ "$MY_IP" != "$DNS_IP" ]; then
  echo "!! $DOMAIN does not point here yet. The game will start, but HTTPS"
  echo "!! will only work once the Hostinger A record shows $MY_IP."
fi

say "Building and starting the game (first time takes 3-6 minutes)"
sudo docker compose -f docker-compose.prod.yml up -d --build

say "Waiting for the site to come up"
for i in $(seq 1 30); do
  if curl -fsS --max-time 5 "https://$DOMAIN/healthz" >/dev/null 2>&1; then
    echo "Live: https://$DOMAIN"
    sudo docker compose -f docker-compose.prod.yml ps
    exit 0
  fi
  sleep 5
done
echo "The game is running but https://$DOMAIN is not answering yet."
echo "See what Caddy says:  sudo docker compose -f docker-compose.prod.yml logs caddy --tail 30"
