import { Module } from '@nestjs/common';
import { GoalHealthService } from './goal-health.service';
import { GoalsController } from './goals.controller';
import { GoalsRepository } from './goals.repository';
import { GoalsService } from './goals.service';

@Module({
  controllers: [GoalsController],
  providers: [GoalsRepository, GoalsService, GoalHealthService],
  exports: [GoalsRepository, GoalsService, GoalHealthService],
})
export class GoalsModule {}
