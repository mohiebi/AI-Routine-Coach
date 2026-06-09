import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AiCostService {
  constructor(private readonly configService: ConfigService) {}

  estimate(promptTokens: number, completionTokens: number) {
    const inputRate = this.configService.get<number>('AI_INPUT_COST_PER_1M', 0.75);
    const outputRate = this.configService.get<number>('AI_OUTPUT_COST_PER_1M', 4.5);

    return (promptTokens / 1_000_000) * inputRate + (completionTokens / 1_000_000) * outputRate;
  }
}
