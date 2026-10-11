#!/usr/bin/env bash
# Generates the HTTPS certificate for DEMO_HOSTNAME with a local mkcert CA.
#   infra/certs/cert.pem, key.pem  -> mounted into Caddy (server key stays on this machine)
#   infra/certs/rootCA.crt         -> PUBLIC CA certificate to install on each client device
# The CA private key stays in $(mkcert -CAROOT) and must never be copied to client devices.
set -euo pipefail
cd "$(dirname "$0")/.."

MKCERT_VERSION="v1.4.4"
MKCERT_SHA256="6d31c65b03972c6dc4a14ab429f2928300518b26503f58723e532d1b0a3bbb52"

hostname="$(grep -E '^DEMO_HOSTNAME=' .env | cut -d= -f2-)"
[[ -n "$hostname" ]] || { echo "DEMO_HOSTNAME is not set in .env" >&2; exit 1; }

if ! command -v mkcert >/dev/null 2>&1; then
  mkdir -p "$HOME/.local/bin"
  tmp="$(mktemp)"
  curl -fsSL -o "$tmp" "https://github.com/FiloSottile/mkcert/releases/download/${MKCERT_VERSION}/mkcert-${MKCERT_VERSION}-linux-amd64"
  echo "${MKCERT_SHA256}  ${tmp}" | sha256sum -c - >/dev/null || { echo "mkcert checksum mismatch" >&2; rm -f "$tmp"; exit 1; }
  install -m 0755 "$tmp" "$HOME/.local/bin/mkcert"
  rm -f "$tmp"
  export PATH="$HOME/.local/bin:$PATH"
  echo "Installed mkcert ${MKCERT_VERSION} to ~/.local/bin"
fi

mkdir -p infra/certs
# Creates the local CA on first use (no system trust-store changes: clients are trusted separately).
mkcert -cert-file infra/certs/cert.pem -key-file infra/certs/key.pem "$hostname"
cp "$(mkcert -CAROOT)/rootCA.pem" infra/certs/rootCA.crt
chmod 644 infra/certs/cert.pem infra/certs/rootCA.crt
# Caddy runs as root in its container; keep the key unreadable to other local users.
chmod 600 infra/certs/key.pem

echo
echo "Certificate for ${hostname}:"
openssl x509 -in infra/certs/cert.pem -noout -subject -ext subjectAltName -enddate
echo
echo "Install infra/certs/rootCA.crt as a trusted root on every client (see docs/SETUP.md)."
