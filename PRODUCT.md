# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Employees of one organization using Nexus Meet for their own internal meetings, day to day. Accounts are created by an admin; there is no self sign-up and there are no guests.

- **Members and hosts:** sign in, create a meeting or join one with a 4-digit room code, talk, share a screen, and watch recordings afterwards.
- **Admins (IT / HR):** create and import users, manage departments and roles, offboard people (suspend now or on a set last day, hand rooms and recordings to someone else), reactivate or anonymize accounts, and read the audit log.

The current deployment is a Local LAN Demo, but the product is designed as the organization's real meeting tool. The demo framing is temporary.

## Product Purpose

Video, audio and screen-share meetings in the browser with nothing to install, hosted entirely inside the organization's own network. Success means staff use it as their normal meeting tool and admins can govern accounts and personal data without leaving the app.

## Positioning

On-premises: the whole system runs on one machine inside the LAN. Video, recordings and personal data never leave the building. The privacy side is part of the product: a versioned privacy notice users must accept, a self-service "Download my data" export, anonymization, configurable retention for recordings and audit logs, and an audit trail.

## Operating Context

- Office Wi-Fi/LAN, reached over HTTPS at a local hostname (default `comms-demo.home.arpa`) using a mkcert certificate.
- Windows/Mac laptops running Chrome or Edge.
- Meetings are one-off: ACTIVE → ENDED by the host. Up to 10 participants per meeting and one recording at a time across the system.
- Notifications are in-app only (bell, polled every 60 s). There is no email and no push.
- Sign-in is limited to one computer at a time per user. This is a policy against accidental double sign-ins, not a security control.

## Capabilities and Constraints

- **Meetings:** 4-digit room codes (`0000`–`9999`), unique among ACTIVE meetings only. A code alone never admits anyone; the user must be signed in. Joining is immediate, with no lobby. Includes a pre-join device check and a connection test page.
- **Host controls:** start/stop recording, mute a participant, remove a participant, end the meeting. Admins have these controls in every meeting. Roles are ADMIN, HOST and MEMBER (see README for the full matrix).
- **Recording:** room composite, 720p MP4, stored in MinIO and streamed through the API. A recording only counts as COMPLETED once the file has been verified.
- **People and profiles:** People directory (no phone, employee ID or suspension status shown), own profile with display name, phone and avatar, sessions list, forced password change on first login or after a reset.
- **Admin:** user search, filters, CSV export/import, departments, offboarding with transfers, audit log.
- **Out of scope (decided 2026-10-11):** chat/channels, AI summaries, whiteboard. The `UXUI/` mockups include these, but they are not part of the product.
- **Language:** the UI is English today. A Thai or bilingual UI is planned, so layouts must leave room for longer strings and Thai script. User-entered content (names, departments, meeting titles) may already be in Thai. The user manual is in Thai.
- **Devices:** desktop layouts only. There is no mobile or tablet support.
- **Open decisions:** retention periods (`AUDIT_RETENTION_DAYS`, `RECORDING_RETENTION_DAYS`) are not yet approved by the organization. Privacy notice text is a draft pending legal review.

## Brand Commitments

- Product name: **Nexus Meet**. It uses the Nexus Enterprise design system (`UXUI/nexus_enterprise/DESIGN.md`, implemented as tokens in `apps/web/src/app/globals.css`).
- There is a logo component at `apps/web/src/components/logo.tsx`.

## Evidence on Hand

- Thai user manual with real screenshots: `docs/USER-MANUAL.md`, `docs/manual-images/`.
- Release notes are shown in-app (`apps/web/src/lib/release-notes.ts`), and release specs live in `docs/releases/`.
- Security review and acceptance tests: `docs/SECURITY-REVIEW.md`, `docs/07-acceptance-test.md`.
- None of the following exist: customer names, testimonials, usage metrics, pricing or certifications. Do not invent them.

## Product Principles

1. **Data stays inside.** Never add a dependency on an outside service, and never imply that data leaves the LAN.
2. **Signed in, always.** A room code is a convenience, never proof of identity. UI must not suggest otherwise.
3. **Only claim what was verified.** For example, a recording is "done" only once its file has been verified. Show real states, not hopeful ones.
4. **Make governance visible.** Offboarding, transfers, privacy actions and audit entries are first-class product, not hidden settings.
5. **Irreversible actions say so.** Anonymize, delete and end meeting must make their consequence clear before the user commits.

## Accessibility & Inclusion

WCAG 2.2 AA is required. Thai script must render and fit everywhere user content appears, and it will need to fit UI copy once Thai localization lands.
