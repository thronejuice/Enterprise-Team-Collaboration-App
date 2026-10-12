# Decisions

Agreed before implementation (2026-10-11). Change here first if the scope changes.

## Product scope

| Topic | Decision |
|---|---|
| Scope | Meeting-first: rooms, room codes, audio/video/screen share, composite recording. No chat/channels, AI summaries, CI/CD or whiteboard from the UXUI mockups; the Nexus design system is used for styling. |
| UI language | English |
| Client devices | Windows/Mac laptops, Chrome/Edge (desktop layout only) |
| Accounts | Created by an admin (web UI or first-admin seed from `.env`). No self sign-up, no guests. Login by email + password (argon2id). |
| Roles | `ADMIN` everything · `HOST` creates meetings and controls their own meetings · `MEMBER` joins with a code |
| Join policy | Signed-in user + valid code of an ACTIVE meeting → admitted immediately (no lobby). The code is never sufficient on its own. |
| Host controls | Start/stop recording, mute a participant's microphone, remove a participant, end meeting. Admins have the same controls in every meeting. |
| Meeting lifecycle | One-off: ACTIVE → ENDED (by the host). Codes are unique among ACTIVE meetings only and may be reused afterwards. The host leaving does not end the meeting. |
| Rejoin | Short network drops reconnect automatically; after leaving, rejoin from "My meetings" without re-entering the code while the meeting is ACTIVE. Removed participants can never rejoin that meeting. |
| Limits | 10 participants per meeting, 1 recording job system-wide, any number of ACTIVE meetings (all configurable in `.env`). |
| Rate limiting | Wrong codes / wrong passwords: 5 failures per user per 15 min → lockouts of 1, 5, 15 min (escalating); 20 failures per source IP per 15 min. See limitation below. |
| Recording | Room composite, `speaker` layout (shared screen large, cameras in a strip), 720p30 H.264/AAC MP4. COMPLETED only after Egress finishes **and** the object is verified in MinIO. |
| Recording access | People who actually joined the meeting, its host, and admins. Removed participants lose access. |
| Retention | Kept until deleted by the meeting's host or an admin (object removed from MinIO, row soft-deleted, audited). |
| Extra pages | Admin users, audit log, pre-join device check, connection diagnostics. |

## Platform

| Topic | Decision |
|---|---|
| Stack | pnpm workspaces · Next.js 16 (App Router, Tailwind 4, `@livekit/components-react`) · NestJS 11 · Prisma 6 · PostgreSQL 16 · Redis 7 |
| Sessions | Opaque token in an httpOnly, Secure, SameSite=Lax cookie; hashed session stored in Redis (12 h sliding) so it can be revoked immediately. State-changing requests from another Origin are rejected. |
| LiveKit tokens | Issued by the API after checking session, membership, meeting state and capacity; 10-minute TTL; only camera/mic/screen sources. LiveKit `room.auto_create` is off, and a `participant_joined` webhook evicts anyone who should no longer be in the room (covers still-valid tokens). |
| Reverse proxy | Caddy on 443 only (HTTP/1.1 + HTTP/2, no port 80). `/api/*` → NestJS, `/livekit/*` → LiveKit signaling, everything else → Next.js. The LiveKit webhook path is blocked at the proxy. |
| Certificates | mkcert local CA (`scripts/certs.sh`); hostname is a variable (`DEMO_HOSTNAME`, default `comms-demo.home.arpa`). |
| Networking | WSL2 NAT mode + Docker Desktop port publishing; LiveKit advertises the Windows host's LAN IP (`LIVEKIT_NODE_IP`). Recommended: raise `.wslconfig` memory to 10 GB. |
| Object storage | `pgsty/minio` (community build of MinIO; the official `minio/minio` image is no longer published), pinned to `RELEASE.2026-08-04T00-00-00Z`. Private bucket; separate write-only (Egress) and read/delete (API) identities. Browsers never talk to MinIO: playback/download is streamed by the API with Range support. |
| Pinned images | `livekit/livekit-server:v1.13.9`, `livekit/egress:v1.15.0`, `postgres:16.15`, `redis:7.4.11`, `caddy:2.11.7`, `pgsty/mc:RELEASE.2026-09-16T00-00-00Z` |
| Config files | LiveKit and Egress YAML are inline `configs:` in `docker-compose.yml`, filled from `.env` (single source of truth). |

## Known limitations

- **Client IPs behind Docker Desktop.** Every LAN client reaches Caddy from the Docker gateway address, so the per-IP
  limit is shared by all clients and the audit log shows the gateway IP. Per-user limits are unaffected.
  The per-IP limit is therefore **off by default** (`RATE_LIMIT_MAX_FAILURES_PER_IP=0`): left on, one person on the LAN
  could lock every user out of login and room codes. Turn it on only where Caddy sees real client IPs
  (Linux host, host networking, or WSL mirrored networking).
- **Lockouts are short on purpose.** An email is public in the People directory, so a long per-user lockout would let
  anyone lock an account. Defaults are 1, 2, then 5 minutes (`RATE_LIMIT_LOCKOUT_MINUTES`), and an administrator can
  unlock an account from its user page. Security review #2 and #3.
- **The one-computer rule is a policy, not a security control.** It is decided from the User-Agent and IP the client
  sends, so someone who sets a phone User-Agent bypasses it. It stops accidental double sign-ins; it does not stop a
  determined person. The refusal message does not say which device or IP holds the other session (security review #7).
- **Automated tests use fake media.** The E2E test proves the shared screen is in the composite layout, not that real
  on-screen text is readable (REC-09); verify that manually on real devices.
- **Not production.** Single node, no HA, no backups beyond Docker volumes (see [01-architecture.md](01-architecture.md) non-goals).
