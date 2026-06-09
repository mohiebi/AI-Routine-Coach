import { Injectable } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  listForDate(userId: string, date: Date) {
    return this.prisma.dailyTask.findMany({
      where: {
        userId,
        date,
        deletedAt: null,
        routine: { isActive: true, deletedAt: null },
        goal: { status: 'ACTIVE', deletedAt: null },
      },
      include: { routine: true, goal: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  listBetween(userId: string, start: Date, end: Date) {
    return this.prisma.dailyTask.findMany({
      where: {
        userId,
        date: { gte: start, lte: end },
        deletedAt: null,
        routine: { isActive: true, deletedAt: null },
        goal: { status: 'ACTIVE', deletedAt: null },
      },
      include: { routine: true, goal: true },
    });
  }

  countRoutineTasks(routineId: string, start: Date, end: Date) {
    return this.prisma.dailyTask.count({
      where: { routineId, date: { gte: start, lte: end }, deletedAt: null },
    });
  }

  createTask(data: Prisma.DailyTaskUncheckedCreateInput) {
    return this.prisma.dailyTask.upsert({
      where: { routineId_date: { routineId: data.routineId, date: data.date } },
      update: {},
      create: data,
    });
  }

  findForUser(userId: string, taskId: string) {
    return this.prisma.dailyTask.findFirst({
      where: {
        id: taskId,
        userId,
        deletedAt: null,
        routine: { isActive: true, deletedAt: null },
        goal: { status: 'ACTIVE', deletedAt: null },
      },
      include: { routine: true, goal: true },
    });
  }

  async markStatus(
    userId: string,
    taskId: string,
    status: TaskStatus,
    note?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.dailyTask.update({
        where: { id: taskId },
        data: {
          status,
          completedAt: status === TaskStatus.COMPLETED ? new Date() : null,
        },
        include: { routine: true, goal: true },
      });
      await tx.taskCompletion.create({
        data: {
          userId,
          dailyTaskId: taskId,
          status,
          note,
        },
      });
      return task;
    });
  }

  updateRoutineStreak(
    routineId: string,
    currentStreak: number,
    bestStreak: number,
  ) {
    return this.prisma.routine.update({
      where: { id: routineId },
      data: { currentStreak, bestStreak },
    });
  }
}
