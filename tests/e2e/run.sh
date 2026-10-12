#!/usr/bin/env bash
# Runs the end-to-end test from a separate container that reaches the demo through the host LAN IP,
# like a client device would. Usage: tests/e2e/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; source .env; set +a
mkdir -p tests/e2e/results

# E2E_NETWORK=<compose network> joins the runner to the backend network so scenario 5 can reach Postgres.
# E2E_SKIP_NSS=1 skips the browser certificate setup (needs internet); API-only runs do not need it.
export E2E_DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public"
RUNNER_SCRIPT='
    set -e
    if [ -z "$E2E_SKIP_NSS" ]; then
      apt-get update -qq >/dev/null && apt-get install -y -qq libnss3-tools >/dev/null
      mkdir -p $HOME/.pki/nssdb && certutil -d sql:$HOME/.pki/nssdb -N --empty-password 2>/dev/null || true
      certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n demo-root -i /repo/infra/certs/rootCA.crt
    fi
    export NODE_EXTRA_CA_CERTS=/repo/infra/certs/rootCA.crt
    status=0; npx playwright test "$@" || status=$?
    chown -R "$HOST_UID" results
    exit $status
'
RUN_ARGS=(--ipc=host
  --add-host "${DEMO_HOSTNAME}:${LIVEKIT_NODE_IP}"
  -e DEMO_HOSTNAME -e ADMIN_EMAIL -e ADMIN_PASSWORD -e E2E_DATABASE_URL -e E2E_SKIP_NSS -e HOST_UID="$(id -u):$(id -g)"
  -v "$PWD:/repo" -w /repo/tests/e2e
  mcr.microsoft.com/playwright:v1.64.0-noble
  bash -c "$RUNNER_SCRIPT" -- "$@")

if [ -z "${E2E_NETWORK:-}" ]; then
  docker run --rm "${RUN_ARGS[@]}"
else
  # Start on the default network (internet and host access), then join the compose backend network for Postgres.
  name="e2e-runner-$$"
  docker run -d --name "$name" "${RUN_ARGS[@]}" >/dev/null
  docker network connect "$E2E_NETWORK" "$name"
  status=$(docker wait "$name")
  docker logs "$name"
  docker rm "$name" >/dev/null
  exit "$status"
fi
