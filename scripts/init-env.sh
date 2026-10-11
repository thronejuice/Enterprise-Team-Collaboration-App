#!/usr/bin/env bash
# Creates .env from .env.example with fresh random secrets. Refuses to overwrite an existing .env.
# Usage: scripts/init-env.sh [hostname] [lan-ip]
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  echo ".env already exists; edit it by hand or move it away first." >&2
  exit 1
fi

hostname="${1:-comms-demo.home.arpa}"
lan_ip="${2:-}"
if [[ -z "$lan_ip" ]] && command -v powershell.exe >/dev/null 2>&1; then
  # WSL: ask Windows for the IPv4 of the adapter that has a default gateway (the real LAN adapter).
  lan_ip=$(powershell.exe -NoProfile -Command \
    '(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq "Up" } | Select-Object -First 1).IPv4Address.IPAddress' \
    2>/dev/null | tr -d '\r\n' || true)
fi
if [[ ! "$lan_ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Could not detect the host LAN IP. Pass it explicitly: scripts/init-env.sh <hostname> <lan-ip>" >&2
  exit 1
fi

secret() { openssl rand -hex "${1:-24}"; }
admin_password="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)"

sed \
  -e "s|^DEMO_HOSTNAME=.*|DEMO_HOSTNAME=${hostname}|" \
  -e "s|^LIVEKIT_NODE_IP=.*|LIVEKIT_NODE_IP=${lan_ip}|" \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(secret)|" \
  -e "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$(secret)|" \
  -e "s|^MINIO_ROOT_PASSWORD=.*|MINIO_ROOT_PASSWORD=$(secret)|" \
  -e "s|^MINIO_EGRESS_SECRET_KEY=.*|MINIO_EGRESS_SECRET_KEY=$(secret)|" \
  -e "s|^MINIO_API_SECRET_KEY=.*|MINIO_API_SECRET_KEY=$(secret)|" \
  -e "s|^LIVEKIT_API_KEY=.*|LIVEKIT_API_KEY=API$(secret 8)|" \
  -e "s|^LIVEKIT_API_SECRET=.*|LIVEKIT_API_SECRET=$(secret 32)|" \
  -e "s|^ADMIN_EMAIL=.*|ADMIN_EMAIL=admin@${hostname}|" \
  -e "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=${admin_password}|" \
  .env.example > .env
chmod 600 .env

echo "Created .env"
echo "  DEMO_HOSTNAME   = ${hostname}"
echo "  LIVEKIT_NODE_IP = ${lan_ip}"
echo "  First admin     = admin@${hostname}  (password is ADMIN_PASSWORD in .env)"
