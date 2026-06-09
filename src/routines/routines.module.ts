import { Module } from '@nestjs/common';
import { GoalsModule } from '../goals/goals.module';
import { RoutinesController } from './routines.controller';
import { RoutinesRepository } from './routines.repository';
import { RoutinesService } from './routines.service';

@Module({
  imports: [GoalsModule],
  controllers: [RoutinesController],
  providers: [RoutinesRepository, RoutinesService],
  exports: [RoutinesRepository, RoutinesService],
})
export class RoutinesModule {}
