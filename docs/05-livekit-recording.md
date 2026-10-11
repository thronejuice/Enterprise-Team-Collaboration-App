# LiveKit WebRTC and Composite Recording

## 1. LiveKit LAN connectivity

The demo requires:
- HTTPS/WebSocket signaling
- WebRTC UDP connectivity
- TCP fallback if UDP is unavailable
- Correct browser permissions
- A client URL that resolves to the actual demo host

Do not rely on signaling success alone.
A browser can connect to signaling while media still fails.

## 2. Verify LiveKit

1. Confirm the LiveKit container is running.
2. Confirm TCP ports 7880 and 7881 are listening.
3. Confirm UDP port 7882 is bound.
4. Open the application from a second LAN device.
5. Join the same room from two separate devices.
6. Confirm bidirectional audio and video.
7. Inspect LiveKit logs and browser WebRTC diagnostics.

Commands:

    docker compose ps
    docker compose logs --tail=200 livekit
    docker compose logs --tail=200 egress
    docker stats

## 3. Frontend configuration

The browser must use the LAN-reachable LiveKit URL,
not a container-only hostname such as ws://livekit:7880.

Use a browser-reachable WSS URL, for example:

    wss://<DEMO_HOSTNAME>/livekit

The reverse proxy must route that path to LiveKit and support WebSocket upgrades.
The exact path and proxy configuration must match the selected LiveKit setup.

NestJS issues short-lived LiveKit access tokens after validating:
- The user's identity
- Room membership
- Room status
- Required permissions

Never expose the LiveKit API secret to the browser.

## 4. Recording requirements

Required output:
- Composite video of meeting participants
- Meeting audio
- Shared screen content
- A persistent output file in MinIO
- Recording metadata in PostgreSQL

Before the demo:
1. Create a private MinIO bucket for recordings.
2. Create a dedicated least-privilege storage identity for Egress.
3. Configure the NestJS recording service to start/stop Egress.
4. Supply the MinIO S3 endpoint, bucket, region and credentials
   to the Egress request/config as required by the chosen Egress version.
5. Save the Egress job ID and state in PostgreSQL.
6. Do not mark the recording as complete until the output file is verified.

## 5. Composite layout

The recording layout must explicitly include:
- Participant video tiles
- Audio from the room
- Shared screen when someone is presenting

Test screen sharing before recording.
Some layouts prioritize the shared screen and display participant tiles
in a smaller region; choose and verify the desired layout.

If the chosen composite layout does not include the screen track,
the recording may succeed but omit the shared content.

## 6. Recording lifecycle

Suggested state machine:

    REQUESTED
       |
       v
    STARTING
       |
       v
    RECORDING
       |
       v
    STOPPING
       |
       v
    UPLOADING / FINALIZING
       |
       v
    COMPLETED

Failure path:
    STARTING / RECORDING / STOPPING
       |
       v
    FAILED

Store:
- recording_id
- room_id
- requested_by
- egress_job_id
- status
- started_at
- ended_at
- object_key
- file_size
- duration
- error_message, if any

## 7. Recording acceptance

1. Start a meeting with two or more clients.
2. Enable camera and microphone on at least two clients.
3. Start recording through the application.
4. Have one client share the full desktop or a window.
5. Speak while the screen is being shared.
6. Stop recording through the application.
7. Wait for Egress to finish and upload the file.
8. Confirm the object exists in MinIO.
9. Download using an authorized application flow.
10. Play the complete file and verify participant video, audio and screen content.
11. Confirm the recording metadata is updated in PostgreSQL.

Do not expose permanent MinIO credentials or unrestricted object URLs
to the frontend. Use an authenticated API and short-lived download URL
or an authorized streaming endpoint.

## 8. Troubleshooting

Signaling works, media fails:
- Check UDP port 7882 and firewall rules.
- Check browser WebRTC stats and ICE candidate selection.
- Test from another LAN device.
- Check VPN, endpoint security and Wi-Fi client isolation.

Egress starts but recording fails:
- Check Egress logs and its LiveKit URL.
- Confirm the Egress container can reach the web application.
- Confirm it can join the room and receive tracks.
- Confirm available memory, CPU and shared memory.
- Confirm MinIO endpoint, bucket and credentials.

Recording has no shared screen:
- Confirm screen sharing was active during the recording.
- Confirm the selected composite layout includes the screen track.
- Confirm the screen-share track is published to the room.