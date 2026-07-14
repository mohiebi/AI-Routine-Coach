import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CheckInsModule } from '../check-ins/check-ins.module';
import { CheckoutModule } from '../checkout/checkout.module';
import { CouponsModule } from '../coupons/coupons.module';
import { GoalsModule } from '../goals/goals.module';
import { PaymentModule } from '../payments/payment.module';
import { PremiumModule } from '../premium/premium.module';
import { ProgressModule } from '../progress/progress.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { RoutinesModule } from '../routines/routines.module';
import { TasksModule } from '../tasks/tasks.module';
import { UsersModule } from '../users/users.module';
import { AiHandler } from './handlers/ai.handler';
import { CheckInHandler } from './handlers/checkin.handler';
import { GoalHandler } from './handlers/goal.handler';
import { PremiumHandler } from './handlers/premium.handler';
import { RoutineHandler } from './handlers/routine.handler';
import { SettingsHandler } from './handlers/settings.handler';
import { TaskHandler } from './handlers/task.handler';
import { TelegramConversationService } from './telegram-conversation.service';
import { TelegramController } from './telegram.controller';
import { TelegramFormattersService } from './telegram-formatters.service';
import { TelegramHelperService } from './telegram-helper.service';
import { TelegramService } from './telegram.service';

const HANDLERS = [
  GoalHandler,
  RoutineHandler,
  TaskHandler,
  CheckInHandler,
  PremiumHandler,
  AiHandler,
  SettingsHandler,
];

@Module({
  imports: [
    AiModule,
    PremiumModule,
    CheckoutModule,
    CouponsModule,
    PaymentModule,
    UsersModule,
    GoalsModule,
    RoutinesModule,
    TasksModule,
    ProgressModule,
    ReviewsModule,
    CheckInsModule,
  ],
  controllers: [TelegramController],
  providers: [
    TelegramService,
    TelegramFormattersService,
    TelegramHelperService,
    TelegramConversationService,
    ...HANDLERS,
  ],
  exports: [TelegramService, TelegramFormattersService],
})
export class TelegramModule {}
