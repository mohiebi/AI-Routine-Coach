import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('returns health metadata', () => {
      expect(appController.health()).toEqual({
        status: 'ok',
        service: 'ai-routine-coach-phase-1',
        aiEnabled: true,
      });
    });
  });
});
