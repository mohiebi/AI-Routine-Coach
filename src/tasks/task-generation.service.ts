import { Injectable } from '@nestjs/common';
import {
  DailyTask,
  Routine,
  RoutineFrequency,
  UserPreference,
} from '@prisma/client';
import {
  daysInclusive,
  getMonthRange,
  getWeekRange,
} from '../common/time/timezone.util';
import { RoutinesRepository } from '../routines/routines.repository';
import { TasksRepository } from './tasks.repository';

type RoutineWithRelations = Routine & {
  schedule: { targetCount: number; frequency: RoutineFrequency } | null;
};

@Injectable()
export class TaskGenerationService {
  constructor(
    private readonly routinesRepository: RoutinesRepository,
    private readonly tasksRepository: TasksRepository,
  ) {}

  async generateForUserDate(
    userId: string,
    date: Date,
    preference: UserPreference,
  ) {
    const routines = await this.routinesRepository.listActiveForUser(userId);
    const generated: DailyTask[] = [];

    for (const routine of routines) {
      if (await this.shouldGenerate(routine, date, preference)) {
        generated.push(
          await this.tasksRepository.createTask({
            userId,
            goalId: routine.goalId,
            routineId: routine.id,
            date,
          }),
        );
      }
    }

    return generated;
  }

  private async shouldGenerate(
    routine: RoutineWithRelations,
    date: Date,
    preference: UserPreference,
  ) {
    const frequency = routine.schedule?.frequency ?? routine.frequency;
    const targetCount = routine.schedule?.targetCount ?? routine.targetCount;

    if (frequency === RoutineFrequency.DAILY) return true;

    const range =
      frequency === RoutineFrequency.WEEKLY
        ? getWeekRange(date, preference.weekStartDay)
        : getMonthRange(date);
    const created = await this.tasksRepository.countRoutineTasks(
      routine.id,
      range.start,
      range.end,
    );
    if (created >= targetCount) return false;

    const remainingNeeded = targetCount - created;
    const remainingDays = daysInclusive(date, range.end);
    return remainingDays <= remainingNeeded;
  }
}
