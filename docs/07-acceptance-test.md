# Acceptance Test — 10 Participants LAN Demo

## Test environment

Record before starting:

- Windows version/build:
- WSL version:
- Linux distribution:
- Docker Engine/Desktop version:
- CPU model/core count:
- RAM:
- Available disk space:
- Demo hostname:
- LAN interface:
- Customer device count:
- LiveKit image tag:
- Egress image tag:
- Test date:

## A. Infrastructure

| ID | Test | Expected result |
|---|---|---|
| INF-01 | Docker Compose config validation | No configuration errors |
| INF-02 | Start PostgreSQL | Healthy |
| INF-03 | Start Redis | Healthy |
| INF-04 | Start MinIO | Running; storage remains private |
| INF-05 | Start LiveKit | Running; no fatal configuration error |
| INF-06 | Start Egress | Running and able to reach LiveKit |
| INF-07 | Restart containers | Persistent database and objects remain |
| INF-08 | Check resource usage | Host remains responsive |

Commands:

    docker compose config
    docker compose ps
    docker compose logs --tail=200
    docker stats

## B. HTTPS and network

| ID | Test | Expected result |
|---|---|---|
| NET-01 | Open demo URL on developer PC | Trusted HTTPS |
| NET-02 | Open same URL on customer device | Trusted HTTPS, no warning |
| NET-03 | Resolve demo hostname | Resolves to the intended LAN host |
| NET-04 | Access application over Wi-Fi | Login page loads |
| NET-05 | Access from another LAN device | No dependence on localhost |
| NET-06 | Check database/storage ports | Not directly accessible to customer |
| NET-07 | Camera/microphone permission | Browser allows permission after consent |
| NET-08 | Screen sharing | Browser offers screen/window sharing |

## C. Room Code and access control

| ID | Test | Expected result |
|---|---|---|
| ROOM-01 | Create a meeting | Valid 4-digit code |
| ROOM-02 | Generate code with leading zero | Preserves all four digits |
| ROOM-03 | Generate simultaneous meetings | No duplicate active codes |
| ROOM-04 | Submit invalid code | Safe error response |
| ROOM-05 | Repeat failed joins | Rate limit is enforced |
| ROOM-06 | Join with authorized identity | Correct room is joined |
| ROOM-07 | Join without permission | Access denied or host approval required |
| ROOM-08 | End meeting | Room state is updated |
| ROOM-09 | Revoke participant access | Participant cannot continue using revoked access |

## D. LiveKit media

| ID | Test | Expected result |
|---|---|---|
| RTC-01 | Two clients join | Both appear in participant list |
| RTC-02 | Camera on/off | State updates correctly |
| RTC-03 | Microphone mute/unmute | State updates correctly |
| RTC-04 | Two-way audio | Both clients can hear each other |
| RTC-05 | Two-way video | Video is visible |
| RTC-06 | Screen share | Shared screen is visible to other clients |
| RTC-07 | Stop screen share | Screen track stops cleanly |
| RTC-08 | Temporary disconnect/rejoin | Rejoin behavior matches requirements |
| RTC-09 | Ten participants | All can join and exchange media |

## E. Recording

| ID | Test | Expected result |
|---|---|---|
| REC-01 | Start recording | Egress job starts |
| REC-02 | Recording indicator | Visible to participants |
| REC-03 | Participant speaks | Audio is recorded |
| REC-04 | Multiple cameras active | Composite includes participant video |
| REC-05 | Share screen during recording | Shared screen appears in output |
| REC-06 | Stop recording | Egress job finalizes |
| REC-07 | Verify object in MinIO | Recording object exists |
| REC-08 | Play recording | Video and audio play correctly |
| REC-09 | Verify screen content | Shared content is readable and present |
| REC-10 | Download unauthorized | Access denied |
| REC-11 | Restart application | Recording metadata and object remain |
| REC-12 | Failed recording | Error state is stored and visible to authorized user |

## F. Load and stability

Test in increasing stages:

1. 2 participants for 5 minutes.
2. 5 participants for 10 minutes.
3. 10 participants for 15–30 minutes.
4. 10 participants with screen sharing.
5. 10 participants with one composite recording job.
6. Stop recording, verify the file, and inspect logs.
7. Repeat the recording test once to detect resource buildup.

Record:
- Peak CPU
- Peak RAM
- Disk free space before/after
- Failed joins
- Audio/video interruptions
- Recording start latency
- Recording finalization latency
- Recording file size
- Browser console errors

## Acceptance criteria

The demo passes only when:

- All 10 participants can join the intended meeting.
- HTTPS is trusted on every test client.
- Audio/video and screen sharing work across separate devices.
- Recording contains participant video, audio and shared screen.
- The recording file can be played after finalization.
- Unauthorized users cannot access meeting recordings.
- Room-code collision and repeated-guess behavior are controlled.
- No critical container failures occur during the final test.
- Resource usage does not make the host or demo unusable.

Capture logs and test results for any failed criterion.
Do not declare acceptance based solely on containers being "Up".