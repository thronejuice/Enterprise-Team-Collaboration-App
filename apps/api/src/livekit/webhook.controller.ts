import { Controller, Headers, HttpCode, Logger, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ParticipantInfo_Kind } from '@livekit/protocol';
import { Public } from '../auth/auth.decorators';
import { MeetingsService } from '../meetings/meetings.service';
import { RecordingsService } from '../recordings/recordings.service';
import { LiveKitService } from './livekit.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Receives signed LiveKit webhooks. Only reachable on the internal Docker network (blocked at the proxy). */
@Controller('livekit')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly livekit: LiveKitService,
    private readonly meetings: MeetingsService,
    private readonly recordings: RecordingsService,
  ) {}

  @Public()
  @Post('webhook')
  @HttpCode(200)
  async handle(@Req() req: Request, @Headers('authorization') authorization?: string) {
    const body = typeof req.body === 'string' ? req.body : '';
    let event;
    try {
      event = await this.livekit.receiveWebhook(body, authorization);
    } catch {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const roomName = event.room?.name ?? event.egressInfo?.roomName ?? '';
    switch (event.event) {
      case 'participant_joined': {
        const participant = event.participant;
        if (participant && participant.kind === ParticipantInfo_Kind.STANDARD && UUID.test(roomName) && UUID.test(participant.identity)) {
          await this.meetings.onParticipantJoined(roomName, participant.identity);
        }
        break;
      }
      case 'egress_started':
      case 'egress_updated':
      case 'egress_ended':
        if (event.egressInfo) await this.recordings.applyEgressInfo(event.egressInfo);
        break;
      default:
        break;
    }
    this.logger.debug(`webhook ${event.event} room=${roomName}`);
    return { ok: true };
  }
}
