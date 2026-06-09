import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { todayInTimezone } from '../common/time/timezone.util';
import { UsersService } from '../users/users.service';
import { CompleteTaskDto } from './dto/complete-task.dto';
import { StreaksService } from './streaks.service';
import { TaskGenerationService } from './task-generation.service';
import { TasksRepository } from './tasks.repository';

@Injectable()
export class TasksService {
  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly taskGenerationService: TaskGenerationService,
    private readonly usersService: UsersService,
    private readonly streaksService: StreaksService,
  ) {}

  async today(userId: string) {
    const user = await this.usersService.findById(userId);
    const preference = user.preference;
    if (!preference)
      throw new BadRequestException('User preferences are required');
    const date = todayInTimezone(preference.timezone);
    await this.taskGenerationService.generateForUserDate(
      userId,
      date,
      preference,
    );
    return this.tasksRepository.listForDate(userId, date);
  }

  async mark(userId: string, taskId: string, dto: CompleteTaskDto) {
    if (dto.status === TaskStatus.PENDING) {
      throw new BadRequestException(
        'Task cannot be moved back to pending through completion flow',
      );
    }
    const existing = await this.tasksRepository.findForUser(userId, taskId);
    if (!existing) throw new NotFoundException('Task not found');

    const task = await this.tasksRepository.markStatus(
      userId,
      taskId,
      dto.status,
      dto.note,
    );
    await this.streaksService.refreshAfterTaskChange(
      userId,
      task.routineId,
      task.goalId,
    );
    return task;
  }
}
