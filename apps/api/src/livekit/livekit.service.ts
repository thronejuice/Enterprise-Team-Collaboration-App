import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AccessToken,
  DataPacket_Kind,
  EgressClient,
  ParticipantInfo,
  RoomServiceClient,
  TrackSource,
  WebhookEvent,
  WebhookReceiver,
} from 'livekit-server-sdk';
import { ParticipantInfo_Kind } from '@livekit/protocol';
import { APP_CONFIG, AppConfig } from '../config';

export interface TokenRequest {
  room: string;
  identity: string;
  name: string;
  metadata?: Record<string, unknown>;
  /** Meetings only allow camera, microphone and screen share; the private diagnostics room allows any source. */
  anySource?: boolean;
}

function isNotFound(error: unknown): boolean {
  const e = error as { status?: number; code?: string; message?: string };
  return e?.status === 404 || e?.code === 'not_found' || /not.?found|does not exist/i.test(e?.message ?? '');
}

@Injectable()
export class LiveKitService {
  private readonly logger = new Logger(LiveKitService.name);
  readonly rooms: RoomServiceClient;
  readonly egress: EgressClient;
  private readonly webhooks: WebhookReceiver;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    const { apiUrl, apiKey, apiSecret } = config.livekit;
    this.rooms = new RoomServiceClient(apiUrl, apiKey, apiSecret);
    this.egress = new EgressClient(apiUrl, apiKey, apiSecret);
    this.webhooks = new WebhookReceiver(apiKey, apiSecret);
  }

  get publicUrl(): string {
    return this.config.livekit.publicUrl;
  }

  /** Rooms are never auto-created by LiveKit (room.auto_create=false); the API creates them. */
  async ensureRoom(name: string, maxParticipants: number, emptyTimeoutSeconds = 300): Promise<void> {
    await this.rooms.createRoom({ name, emptyTimeout: emptyTimeoutSeconds, departureTimeout: 20, maxParticipants });
  }

  async issueToken(req: TokenRequest): Promise<string> {
    const token = new AccessToken(this.config.livekit.apiKey, this.config.livekit.apiSecret, {
      identity: req.identity,
      name: req.name,
      ttl: this.config.livekit.tokenTtlSeconds,
      metadata: req.metadata ? JSON.stringify(req.metadata) : undefined,
    });
    token.addGrant({
      room: req.room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: false,
      canPublishSources: req.anySource
        ? undefined
        : [TrackSource.CAMERA, TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
    });
    return token.toJwt();
  }

  /** Human participants currently connected (excludes the Egress recorder and other services). */
  async listHumanParticipants(room: string): Promise<ParticipantInfo[]> {
    try {
      const participants = await this.rooms.listParticipants(room);
      return participants.filter((p) => p.kind === ParticipantInfo_Kind.STANDARD);
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
  }

  async removeParticipant(room: string, identity: string): Promise<void> {
    try {
      await this.rooms.removeParticipant(room, identity);
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  async deleteRoom(room: string): Promise<void> {
    try {
      await this.rooms.deleteRoom(room);
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  /** Server-side mute of a participant's microphone; returns how many tracks were muted. */
  async muteMicrophone(room: string, identity: string): Promise<number> {
    const participant = (await this.listHumanParticipants(room)).find((p) => p.identity === identity);
    if (!participant) return 0;
    const mics = participant.tracks.filter((t) => t.source === TrackSource.MICROPHONE && !t.muted);
    for (const track of mics) {
      await this.rooms.mutePublishedTrack(room, identity, track.sid, true);
    }
    return mics.length;
  }

  async sendToParticipant(room: string, identity: string, topic: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.rooms.sendData(room, new TextEncoder().encode(JSON.stringify(payload)), DataPacket_Kind.RELIABLE, {
        destinationIdentities: [identity],
        topic,
      });
    } catch (error) {
      this.logger.warn(`sendData to ${identity} failed: ${(error as Error).message}`);
    }
  }

  receiveWebhook(body: string, authHeader: string | undefined): Promise<WebhookEvent> {
    return this.webhooks.receive(body, authHeader);
  }
}

export { isNotFound };
