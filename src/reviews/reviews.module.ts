import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { UsersModule } from '../users/users.module';
import { ReviewMetricsService } from './review-metrics.service';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [TasksModule, UsersModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewMetricsService],
  exports: [ReviewsService, ReviewMetricsService],
})
export class ReviewsModule {}
