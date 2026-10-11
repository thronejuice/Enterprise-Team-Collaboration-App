#!/usr/bin/env bash
# Runs the end-to-end test from a separate container that reaches the demo through the host LAN IP,
# like a client device would. Usage: tests/e2e/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; source .env; set +a
mkdir -p tests/e2e/results

docker run --rm --ipc=host \
  --add-host "${DEMO_HOSTNAME}:${LIVEKIT_NODE_IP}" \
  -e DEMO_HOSTNAME -e ADMIN_EMAIL -e ADMIN_PASSWORD -e HOST_UID="$(id -u):$(id -g)" \
  -v "$PWD:/repo" -w /repo/tests/e2e \
  mcr.microsoft.com/playwright:v1.64.0-noble \
  bash -c '
    set -e
    apt-get update -qq >/dev/null && apt-get install -y -qq libnss3-tools >/dev/null
    mkdir -p $HOME/.pki/nssdb && certutil -d sql:$HOME/.pki/nssdb -N --empty-password 2>/dev/null || true
    certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n demo-root -i /repo/infra/certs/rootCA.crt
    export NODE_EXTRA_CA_CERTS=/repo/infra/certs/rootCA.crt
    status=0; npx playwright test "$@" || status=$?
    chown -R "$HOST_UID" results
    exit $status
  ' -- "$@"
