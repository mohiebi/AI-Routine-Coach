import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GoalsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.GoalUncheckedCreateInput) {
    return this.prisma.goal.create({ data });
  }

  listForUser(userId: string, includeArchived = false) {
    return this.prisma.goal.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(includeArchived ? {} : { status: { not: 'ARCHIVED' as const } }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        routines: {
          where: includeArchived
            ? { deletedAt: null }
            : { isActive: true, deletedAt: null },
        },
      },
    });
  }

  findForUser(userId: string, goalId: string) {
    return this.prisma.goal.findFirst({
      where: { id: goalId, userId, deletedAt: null },
      include: { routines: true },
    });
  }

  update(userId: string, goalId: string, data: Prisma.GoalUpdateInput) {
    return this.prisma.goal.update({
      where: { id: goalId, userId },
      data,
    });
  }
}
