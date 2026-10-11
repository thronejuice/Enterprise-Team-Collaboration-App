import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { AuthUser, ClientIp, CurrentUser } from '../common/request';
import { MeetingsService } from './meetings.service';

class CreateMeetingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title: string;
}

class JoinDto {
  /** Validated as exactly four digits by the service, which must count malformed codes as failures too. */
  @IsString()
  @MaxLength(16)
  roomCode: string;
}

@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateMeetingDto, @ClientIp() ip: string) {
    return this.meetings.create(user, dto.title, ip);
  }

  @Post('join')
  @HttpCode(200)
  join(@CurrentUser() user: AuthUser, @Body() dto: JoinDto, @ClientIp() ip: string) {
    return this.meetings.joinByCode(user, dto.roomCode, ip);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.meetings.listMine(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.get(user, id);
  }

  @Post(':id/token')
  @HttpCode(200)
  token(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ClientIp() ip: string) {
    return this.meetings.issueToken(user, id, ip);
  }

  @Post(':id/end')
  @HttpCode(200)
  end(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ClientIp() ip: string) {
    return this.meetings.end(user, id, ip);
  }

  @Post(':id/participants/:userId/remove')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @ClientIp() ip: string,
  ) {
    return this.meetings.removeParticipant(user, id, userId, ip);
  }

  @Post(':id/participants/:userId/mute')
  @HttpCode(200)
  mute(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @ClientIp() ip: string,
  ) {
    return this.meetings.muteParticipant(user, id, userId, ip);
  }
}
