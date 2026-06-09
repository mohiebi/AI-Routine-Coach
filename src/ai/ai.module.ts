import { Module } from '@nestjs/common';
import { GoalsModule } from '../goals/goals.module';
import { ProgressModule } from '../progress/progress.module';
import { RoutinesModule } from '../routines/routines.module';
import { AiController } from './ai.controller';
import { AiCostService } from './ai-cost.service';
import { AiContextService } from './ai-context.service';
import { AiFeatureGateService } from './ai-feature-gate.service';
import { AiService } from './ai.service';
import { AiValidationService } from './ai-validation.service';
import { OpenAiProvider } from './providers/openai.provider';

@Module({
  imports: [GoalsModule, RoutinesModule, ProgressModule],
  controllers: [AiController],
  providers: [
    AiService,
    AiContextService,
    AiFeatureGateService,
    AiCostService,
    AiValidationService,
    OpenAiProvider,
  ],
  exports: [AiService, AiFeatureGateService],
})
export class AiModule {}
