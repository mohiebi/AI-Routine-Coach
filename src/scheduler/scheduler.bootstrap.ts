import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ROUTINE_SCHEDULER_QUEUE } from './scheduler.constants';

@Injectable()
export class SchedulerBootstrap implements OnModuleInit {
  private readonly logger = new Logger(SchedulerBootstrap.name);

  constructor(
    @InjectQueue(ROUTINE_SCHEDULER_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    await this.queue.add(
      'tick',
      {},
      {
        jobId: 'routine-scheduler-tick',
        repeat: { every: 60_000 },
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
    this.logger.log('Routine scheduler tick registered');
  }
}
