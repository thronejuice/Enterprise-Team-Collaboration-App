import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

export type NotificationKind =
  | 'password.changed'
  | 'session.revoked'
  | 'account.reactivated'
  | 'login.new_device'
  | 'login.blocked_other_computer'
  | 'meeting.joined_by_code'
  | 'admin.data_exported'
  | 'admin.users_imported'
  | 'admin.user_anonymized';

/** In-app notifications. Creating one must never fail the action that caused it, so errors are only logged. */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async notify(userIds: string[], kind: NotificationKind, title: string, body: string): Promise<void> {
    if (userIds.length === 0) return;
    try {
      await this.prisma.notification.createMany({ data: userIds.map((userId) => ({ userId, kind, title, body })) });
    } catch (error) {
      this.logger.error(`Could not create ${kind} notification: ${(error as Error).message}`);
    }
  }

  /** Active admins other than the actor: the people who should know about admin-side data actions. */
  async otherAdminIds(exceptUserId: string): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true, anonymizedAt: null, id: { not: exceptUserId } },
      select: { id: true },
    });
    return admins.map((a) => a.id);
  }

  async list(userId: string) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { unread, items: items.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, createdAt: n.createdAt, read: n.readAt !== null })) };
  }

  async markRead(userId: string, id: string): Promise<boolean> {
    const res = await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    return res.count > 0;
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  }
}
