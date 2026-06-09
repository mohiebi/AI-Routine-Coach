import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RoutinesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.RoutineUncheckedCreateInput) {
    return this.prisma.routine.create({
      data: {
        ...data,
        schedule: {
          create: {
            frequency: data.frequency,
            targetCount: data.targetCount,
          },
        },
      },
      include: { schedule: true, goal: true },
    });
  }

  listForUser(userId: string, includeInactive = false) {
    return this.prisma.routine.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
        goal: { status: 'ACTIVE', deletedAt: null },
      },
      include: { goal: true, schedule: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  listActiveForUser(userId: string) {
    return this.prisma.routine.findMany({
      where: {
        userId,
        isActive: true,
        deletedAt: null,
        goal: { status: 'ACTIVE', deletedAt: null },
      },
      include: { schedule: true, goal: true },
    });
  }

  findForUser(userId: string, routineId: string) {
    return this.prisma.routine.findFirst({
      where: { id: routineId, userId, deletedAt: null },
      include: { goal: true, schedule: true },
    });
  }

  update(routineId: string, data: Prisma.RoutineUpdateInput) {
    return this.prisma.routine.update({
      where: { id: routineId },
      data,
      include: { schedule: true, goal: true },
    });
  }

  updateSchedule(
    routineId: string,
    frequency: Prisma.EnumRoutineFrequencyFieldUpdateOperationsInput['set'],
    targetCount: number,
  ) {
    return this.prisma.routineSchedule.update({
      where: { routineId },
      data: { frequency, targetCount },
    });
  }
}
