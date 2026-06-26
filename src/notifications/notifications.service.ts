import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  log(
    userId: string,
    type: NotificationType,
    metadata?: Prisma.InputJsonValue,
  ) {
    return this.prisma.notificationLog.create({
      data: { userId, type, metadata },
    });
  }

  async alreadySentEver(userId: string, type: NotificationType) {
    const count = await this.prisma.notificationLog.count({
      where: { userId, type, deletedAt: null },
    });
    return count > 0;
  }

  async alreadySentToday(userId: string, type: NotificationType, date: Date) {
    const start = new Date(date);
    const end = new Date(date);
    end.setUTCDate(end.getUTCDate() + 1);

    const count = await this.prisma.notificationLog.count({
      where: {
        userId,
        type,
        sentAt: { gte: start, lt: end },
        deletedAt: null,
      },
    });

    return count > 0;
  }
}
