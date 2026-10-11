# Architecture and Resource Plan

## Request flow

Customer Browser
  ├── HTTPS ──> Reverse Proxy ──> Next.js
  ├── HTTPS ──> Reverse Proxy ──> NestJS API
  ├── WebSocket/HTTPS ──────────> LiveKit Signaling
  └── WebRTC UDP/TCP ───────────> LiveKit SFU

NestJS
  ├── PostgreSQL: users, rooms, membership, recording metadata
  ├── Redis: LiveKit/Egress coordination and application cache
  ├── LiveKit API: create room, issue token, control Egress
  └── MinIO: private object storage

LiveKit Egress
  ├── Connects to LiveKit
  ├── Captures room composite: participant video, audio and shared screen
  └── Writes recording output to MinIO

## Resource constraints

Host RAM: 16 GB
CPU: must be measured on the actual machine

Start with:
- One demo room
- Maximum 10 participants
- One active composite recording job
- Short recording duration for initial tests
- No concurrent load tests while building the image or running database migrations

Monitor:
- Windows Task Manager: CPU, Memory, Disk
- WSL: free -h, top
- Docker: docker stats
- Browser CPU and memory on participant devices

## Recording storage estimate

Estimate using measured output bitrate:

Storage in GB (decimal) ≈ bitrate in Mbps × duration in seconds / 8,000

Example:
A recording averaging 4 Mbps for 60 minutes:
4 × 3,600 / 8,000 ≈ 1.8 GB

Actual size depends on codec, frame rate, resolution, motion, audio and container overhead.

## Non-goals

- Production high availability
- Internet-facing deployment
- Multi-region media routing
- Hundreds of concurrent participants
- Long-term disaster recovery