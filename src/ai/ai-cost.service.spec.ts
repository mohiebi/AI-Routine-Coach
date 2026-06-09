import { ConfigService } from '@nestjs/config';
import { AiCostService } from './ai-cost.service';

describe('AiCostService', () => {
  it('estimates cost from configured per-million token rates', () => {
    const config = {
      get: jest.fn((key: string, fallback: number) => {
        if (key === 'AI_INPUT_COST_PER_1M') return 1;
        if (key === 'AI_OUTPUT_COST_PER_1M') return 5;
        return fallback;
      }),
    } as unknown as ConfigService;
    const service = new AiCostService(config);

    expect(service.estimate(1_000_000, 500_000)).toBe(3.5);
  });
});
