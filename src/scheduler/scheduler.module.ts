import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { TasksModule } from '../tasks/tasks.module';
import { TelegramModule } from '../telegram/telegram.module';
import { UsersModule } from '../users/users.module';
import { ROUTINE_SCHEDULER_QUEUE } from './scheduler.constants';
import { SchedulerBootstrap } from './scheduler.bootstrap';
import { SchedulerProcessor } from './scheduler.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: ROUTINE_SCHEDULER_QUEUE }),
    UsersModule,
    TasksModule,
    TelegramModule,
    NotificationsModule,
    ReviewsModule,
  ],
  providers: [SchedulerBootstrap, SchedulerProcessor],
})
export class SchedulerModule {}
