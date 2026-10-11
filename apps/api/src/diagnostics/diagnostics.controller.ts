import { Controller, HttpCode, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../common/request';
import { LiveKitService } from '../livekit/livekit.service';

/** Issues a token for a private, throwaway room used by the browser connection test. */
@Controller('diagnostics')
export class DiagnosticsController {
  constructor(private readonly livekit: LiveKitService) {}

  @Post('token')
  @HttpCode(200)
  async token(@CurrentUser() user: AuthUser) {
    const room = `diag-${user.id}`;
    await this.livekit.ensureRoom(room, 2, 30);
    const token = await this.livekit.issueToken({ room, identity: user.id, name: user.displayName, anySource: true });
    return { token, url: this.livekit.publicUrl, room };
  }
}
