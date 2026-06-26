import { Injectable, NotFoundException } from '@nestjs/common';
import { GoalsService } from '../goals/goals.service';
import { CreateRoutineDto } from './dto/create-routine.dto';
import { UpdateRoutineDto } from './dto/update-routine.dto';
import { RoutinesRepository } from './routines.repository';

@Injectable()
export class RoutinesService {
  constructor(
    private readonly routinesRepository: RoutinesRepository,
    private readonly goalsService: GoalsService,
  ) {}

  async create(userId: string, dto: CreateRoutineDto) {
    await this.goalsService.find(userId, dto.goalId);
    return this.routinesRepository.create({
      userId,
      goalId: dto.goalId,
      title: dto.title,
      description: dto.description,
      frequency: dto.frequency,
      targetCount: dto.targetCount,
      estimatedDuration: dto.estimatedDuration,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
    });
  }

  list(userId: string, includeInactive = false) {
    return this.routinesRepository.listForUser(userId, includeInactive);
  }

  async find(userId: string, routineId: string) {
    const routine = await this.routinesRepository.findForUser(
      userId,
      routineId,
    );
    if (!routine) {
      throw new NotFoundException('Routine not found');
    }
    return routine;
  }

  async update(userId: string, routineId: string, dto: UpdateRoutineDto) {
    await this.find(userId, routineId);
    const routine = await this.routinesRepository.update(routineId, {
      title: dto.title,
      description: dto.description,
      frequency: dto.frequency,
      targetCount: dto.targetCount,
      estimatedDuration: dto.estimatedDuration,
    });

    if (dto.frequency || dto.targetCount) {
      await this.routinesRepository.updateSchedule(
        routineId,
        dto.frequency ?? routine.frequency,
        dto.targetCount ?? routine.targetCount,
      );
    }

    return this.find(userId, routineId);
  }

  async archive(userId: string, routineId: string) {
    await this.find(userId, routineId);
    return this.routinesRepository.update(routineId, {
      isActive: false,
      deletedAt: new Date(),
    });
  }
}
