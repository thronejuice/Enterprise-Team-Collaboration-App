import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditController } from './audit/audit.controller';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { SessionService } from './auth/session.service';
import { GlobalModule } from './common/global.module';
import { DiagnosticsController } from './diagnostics/diagnostics.controller';
import { HealthController } from './health.controller';
import { WebhookController } from './livekit/webhook.controller';
import { MeetingsController } from './meetings/meetings.controller';
import { MeetingsService } from './meetings/meetings.service';
import { RecordingsController } from './recordings/recordings.controller';
import { RecordingsService } from './recordings/recordings.service';
import { UsersController } from './users/users.controller';

@Module({
  imports: [GlobalModule, ScheduleModule.forRoot()],
  controllers: [
    HealthController,
    AuthController,
    UsersController,
    AuditController,
    MeetingsController,
    RecordingsController,
    WebhookController,
    DiagnosticsController,
  ],
  providers: [SessionService, MeetingsService, RecordingsService, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
