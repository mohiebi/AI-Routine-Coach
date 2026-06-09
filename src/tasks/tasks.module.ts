import { Module } from '@nestjs/common';
import { GoalsModule } from '../goals/goals.module';
import { RoutinesModule } from '../routines/routines.module';
import { UsersModule } from '../users/users.module';
import { StreaksService } from './streaks.service';
import { TaskGenerationService } from './task-generation.service';
import { TasksController } from './tasks.controller';
import { TasksRepository } from './tasks.repository';
import { TasksService } from './tasks.service';

@Module({
  imports: [GoalsModule, RoutinesModule, UsersModule],
  controllers: [TasksController],
  providers: [
    TasksRepository,
    TasksService,
    TaskGenerationService,
    StreaksService,
  ],
  exports: [
    TasksRepository,
    TasksService,
    TaskGenerationService,
    StreaksService,
  ],
})
export class TasksModule {}
