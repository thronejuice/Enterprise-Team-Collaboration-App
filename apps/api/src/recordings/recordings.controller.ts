import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ConflictException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Readable } from 'node:stream';
import { AuditService } from '../audit/audit.service';
import { AuthUser, ClientIp, CurrentUser } from '../common/request';
import { RecordingsService } from './recordings.service';
import { StorageService } from './storage.service';

const RANGE_PATTERN = /^bytes=\d*-\d*$/;

function downloadName(title: string, createdAt: Date): string {
  const slug = title.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'meeting';
  return `${slug}-${createdAt.toISOString().slice(0, 16).replace(/[:T]/g, '')}.mp4`;
}

@Controller()
export class RecordingsController {
  constructor(
    private readonly recordings: RecordingsService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  @Post('meetings/:id/recordings')
  start(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) meetingId: string, @ClientIp() ip: string) {
    return this.recordings.start(user, meetingId, ip);
  }

  @Get('meetings/:id/recordings')
  listForMeeting(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) meetingId: string) {
    return this.recordings.list(user, meetingId);
  }

  @Post('recordings/:id/stop')
  @HttpCode(200)
  stop(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ClientIp() ip: string) {
    return this.recordings.stop(user, id, ip);
  }

  @Get('recordings')
  list(@CurrentUser() user: AuthUser) {
    return this.recordings.list(user);
  }

  @Get('recordings/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ClientIp() ip: string) {
    return this.recordings.get(user, id, ip);
  }

  @Delete('recordings/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ClientIp() ip: string) {
    return this.recordings.delete(user, id, ip);
  }

  /** Authenticated streaming with HTTP Range support; MinIO is never exposed to the browser. */
  @Get('recordings/:id/file')
  async file(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('download') download: string | undefined,
    @ClientIp() ip: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const recording = await this.recordings.loadViewable(user, id, ip);
    if (recording.status !== 'COMPLETED') throw new ConflictException('This recording is not ready.');

    const rangeHeader = typeof req.headers.range === 'string' && RANGE_PATTERN.test(req.headers.range) ? req.headers.range : undefined;
    const isDownload = download === '1';
    if (isDownload || !rangeHeader || rangeHeader.startsWith('bytes=0-')) {
      await this.audit.log({
        action: isDownload ? 'recording.downloaded' : 'recording.viewed',
        actorId: user.id,
        targetType: 'recording',
        targetId: recording.id,
        ip,
      });
    }

    let object;
    try {
      object = await this.storage.get(recording.objectKey, rangeHeader);
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 416) {
        res.status(416).end();
        return;
      }
      throw error;
    }

    res.status(object.ContentRange ? 206 : 200);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, no-store');
    if (object.ContentLength !== undefined) res.setHeader('Content-Length', String(object.ContentLength));
    if (object.ContentRange) res.setHeader('Content-Range', object.ContentRange);
    const filename = downloadName(recording.meeting.title, recording.createdAt);
    res.setHeader('Content-Disposition', `${isDownload ? 'attachment' : 'inline'}; filename="${filename}"`);

    const body = object.Body as Readable;
    req.on('close', () => body.destroy());
    body.pipe(res);
  }
}
