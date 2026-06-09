import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiPortsModule } from './ai/ai-ports.module';
import { CheckInsModule } from './check-ins/check-ins.module';
import { validateEnvironment } from './config/env.validation';
import { GoalsModule } from './goals/goals.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProgressModule } from './progress/progress.module';
import { ReviewsModule } from './reviews/reviews.module';
import { RoutinesModule } from './routines/routines.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { TasksModule } from './tasks/tasks.module';
import { TelegramModule } from './telegram/telegram.module';
import { UsersModule } from './users/users.module';

const schedulerEnabled =
  process.env.SCHEDULER_ENABLED === undefined
    ? process.env.VERCEL !== '1'
    : process.env.SCHEDULER_ENABLED !== 'false';

const schedulerImports = schedulerEnabled
  ? [
      BullModule.forRootAsync({
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          connection: {
            host: configService.getOrThrow<string>('REDIS_HOST'),
            port: configService.get<number>('REDIS_PORT', 6379),
            password: configService.get<string>('REDIS_PASSWORD'),
          },
        }),
      }),
      SchedulerModule,
    ]
  : [];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: { singleLine: true },
              },
      },
    }),
    PrismaModule,
    AiPortsModule,
    UsersModule,
    GoalsModule,
    RoutinesModule,
    TasksModule,
    CheckInsModule,
    ReviewsModule,
    ProgressModule,
    NotificationsModule,
    TelegramModule,
    ...schedulerImports,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
