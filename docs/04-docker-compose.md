project-root/
├── docker-compose.yml        # all services; LiveKit/Egress YAML are inline `configs:` filled from .env
├── .env                      # created by scripts/init-env.sh (never commit)
├── .env.example
├── infra/
│   ├── Caddyfile             # HTTPS reverse proxy (443 only)
│   ├── minio-init.sh         # private bucket + least-privilege identities
│   └── certs/                # created by scripts/certs.sh (never commit)
├── apps/
│   ├── web/                  # Next.js
│   └── api/                  # NestJS + Prisma
├── scripts/                  # init-env.sh, certs.sh, windows/*.ps1
├── tests/e2e/                # Playwright end-to-end test (run.sh)
└── docs/

# Docker Compose — LAN Demo

## 1. Security rules

- Do not commit .env.
- Use strong, unique secrets.
- Pin and test image versions before the customer demo.
- Publish only the ports that clients need.
- Keep PostgreSQL, Redis and MinIO private on the Docker network.
- Store persistent data in named volumes.
- Back up demo data and recordings before destructive changes.

## 2. Verify Docker

Run inside the environment where Docker commands will run:

    docker version
    docker compose version
    docker info
    docker ps

If using Docker Desktop, verify WSL integration is enabled for the selected
Linux distribution.

## 3. Create environment file

Copy .env.example to .env, then set unique credentials.
Never use the example values as production or shared-demo credentials.

## 4. Start infrastructure

    docker compose config
    docker compose pull
    docker compose up -d postgres redis minio minio-init

The official `minio/minio` image is no longer published; the stack uses the pinned community build
`pgsty/minio` (see [DECISIONS.md](DECISIONS.md)).

Verify:

    docker compose ps
    docker compose logs --tail=100 postgres redis minio

## 5. Start LiveKit

    docker compose up -d livekit
    docker compose logs --tail=100 livekit

## 6. Start Egress only after LiveKit is reachable

    docker compose up -d egress
    docker compose logs --tail=200 egress

## 7. Start the application

    docker compose up -d --build api web caddy

The API container runs `prisma migrate deploy` and creates the first admin from `.env` on start.
Or simply `docker compose up -d --build` for everything; `depends_on` enforces the order.

Do not expose database or storage service ports to the client LAN.

## 8. Common commands

    docker compose ps
    docker compose top
    docker stats
    docker compose logs -f livekit
    docker compose logs -f egress
    docker compose restart egress

## 9. Stop and preserve data

    docker compose down

Do not add -v unless intentionally deleting named volumes.
Do not delete the MinIO volume while recordings must be retained.