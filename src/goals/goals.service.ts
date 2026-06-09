import { Injectable, NotFoundException } from '@nestjs/common';
import { GoalStatus } from '@prisma/client';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { GoalsRepository } from './goals.repository';

@Injectable()
export class GoalsService {
  constructor(private readonly goalsRepository: GoalsRepository) {}

  create(userId: string, dto: CreateGoalDto) {
    return this.goalsRepository.create({
      userId,
      title: dto.title,
      description: dto.description,
      category: dto.category,
      startDate: new Date(dto.startDate),
      targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
      status: dto.status ?? GoalStatus.ACTIVE,
    });
  }

  list(userId: string, includeArchived = false) {
    return this.goalsRepository.listForUser(userId, includeArchived);
  }

  async find(userId: string, goalId: string) {
    const goal = await this.goalsRepository.findForUser(userId, goalId);
    if (!goal) {
      throw new NotFoundException('Goal not found');
    }
    return goal;
  }

  async update(userId: string, goalId: string, dto: UpdateGoalDto) {
    await this.find(userId, goalId);
    return this.goalsRepository.update(userId, goalId, {
      ...dto,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
    });
  }

  async archive(userId: string, goalId: string) {
    await this.find(userId, goalId);
    return this.goalsRepository.update(userId, goalId, {
      status: GoalStatus.ARCHIVED,
      archivedAt: new Date(),
    });
  }
}
