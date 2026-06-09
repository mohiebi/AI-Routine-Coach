import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  health() {
    return {
      status: 'ok',
      service: 'ai-routine-coach-phase-1',
      aiEnabled: true,
    };
  }
}
