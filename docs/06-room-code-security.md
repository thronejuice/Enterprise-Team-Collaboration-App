# Room Code and Access Control

## 1. Room Code

- Format: exactly four decimal digits.
- Valid range: 0000–9999.
- Preserve leading zeroes as strings.
- Generate using a cryptographically secure random generator.
- Enforce uniqueness in the intended scope using a database constraint.
- On collision, generate a new code and retry a bounded number of times.
- Do not use room_code as the primary key.

Recommended fields:

    meeting_id UUID PRIMARY KEY
    room_code CHAR(4) NOT NULL
    created_by UUID NOT NULL
    status VARCHAR(...) NOT NULL
    created_at TIMESTAMP NOT NULL
    ended_at TIMESTAMP NULL

Use a unique constraint for active room codes if the product allows code
reuse after a meeting ends. Implement that policy explicitly.

## 2. Room Code is not authentication

Knowing the four-digit code must not automatically grant unrestricted access.

Recommended join flow:

1. User signs in or enters an approved guest identity.
2. User submits the room code.
3. NestJS checks room state, access policy and rate limits.
4. NestJS issues a short-lived LiveKit token with limited room permissions.
5. The browser joins using that token.
6. Token expiration and participant removal are handled by server policy.

## 3. Abuse controls

- Rate-limit room-code attempts by user and source.
- Add temporary lockout or escalating delays for repeated failures.
- Avoid revealing whether a code exists to unauthorized users.
- Require a host approval or invitation policy if meetings are private.
- Log security events without storing access tokens or secrets.
- Revoke or disconnect participants when access is withdrawn.

## 4. Recording permissions

- Only authorized roles can start/stop recording.
- Show a visible recording indicator.
- Notify participants when recording starts and stops.
- Store who started recording and when.
- Restrict playback and downloads by meeting membership/role.
- Apply the agreed retention policy; do not make recordings public by default.

## 5. Storage access

- Keep MinIO buckets private.
- Use a dedicated least-privilege identity for recording uploads.
- Never return MinIO root credentials to the browser.
- Use short-lived presigned URLs or authenticated streaming.
- Audit access to recordings.