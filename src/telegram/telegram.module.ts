import { Module } from '@nestjs/common';
import { CheckInsModule } from '../check-ins/check-ins.module';
import { GoalsModule } from '../goals/goals.module';
import { ProgressModule } from '../progress/progress.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { RoutinesModule } from '../routines/routines.module';
import { TasksModule } from '../tasks/tasks.module';
import { UsersModule } from '../users/users.module';
import { TelegramFormattersService } from './telegram-formatters.service';
import { TelegramService } from './telegram.service';

@Module({
  imports: [
    UsersModule,
    GoalsModule,
    RoutinesModule,
    TasksModule,
    ProgressModule,
    ReviewsModule,
    CheckInsModule,
  ],
  providers: [TelegramService, TelegramFormattersService],
  exports: [TelegramService, TelegramFormattersService],
})
export class TelegramModule {}
