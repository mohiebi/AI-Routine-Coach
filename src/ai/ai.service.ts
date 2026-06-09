import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AIFeature,
  AIInteraction,
  AIInteractionStatus,
  AIRoutineRecommendationStatus,
  GoalStatus,
  Prisma,
} from '@prisma/client';
import { GoalsService } from '../goals/goals.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoutinesService } from '../routines/routines.service';
import {
  coachSchema,
  goalBreakdownSchema,
  goalReviewSchema,
  monthlyCoachSchema,
  progressInsightSchema,
  routineOptimizationSchema,
  routineRecommendationsSchema,
  weeklyCoachSchema,
} from './ai.schemas';
import { AiCostService } from './ai-cost.service';
import { AiContextService } from './ai-context.service';
import { AiFeatureGateService } from './ai-feature-gate.service';
import {
  accountabilityCoachInstructions,
  goalBreakdownInstructions,
  goalReviewInstructions,
  monthlyCoachInstructions,
  progressInsightInstructions,
  routineOptimizationInstructions,
  routineRecommendationInstructions,
  weeklyCoachInstructions,
} from './ai-prompts';
import { AiCircuitOpenError, AiProviderUnavailableError } from './ai.types';
import { AiValidationService } from './ai-validation.service';
import {
  AcceptRoutineRecommendationsDto,
  CoachMessageDto,
  RoutineRecommendationRequestDto,
  SetSubscriptionDto,
} from './dto/ai-request.dto';
import {
  CoachOutputDto,
  GoalBreakdownOutputDto,
  GoalReviewOutputDto,
  MonthlyCoachOutputDto,
  ProgressInsightOutputDto,
  RoutineOptimizationOutputDto,
  RoutineRecommendationDto,
  RoutineRecommendationsOutputDto,
  WeeklyCoachOutputDto,
} from './dto/ai-output.dto';
import { OpenAiProvider } from './providers/openai.provider';

type DtoClass<T> = new () => T;

interface AiRunOptions<T extends object> {
  userId: string;
  feature: AIFeature;
  schemaName: string;
  schema: Record<string, unknown>;
  instructions: string;
  context: Record<string, unknown>;
  dtoClass: DtoClass<T>;
}

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goalsService: GoalsService,
    private readonly routinesService: RoutinesService,
    private readonly contextService: AiContextService,
    private readonly gateService: AiFeatureGateService,
    private readonly provider: OpenAiProvider,
    private readonly validationService: AiValidationService,
    private readonly costService: AiCostService,
  ) {}

  setSubscription(userId: string, dto: SetSubscriptionDto) {
    return this.gateService.setSubscription(userId, dto.plan, dto.status);
  }

  async reviewGoal(userId: string, goalId: string) {
    const context = await this.contextService.goal(userId, goalId);
    const { data, interaction } = await this.runFeature({
      userId,
      feature: AIFeature.GOAL_REVIEW,
      schemaName: 'goal_review',
      schema: goalReviewSchema,
      instructions: goalReviewInstructions,
      context,
      dtoClass: GoalReviewOutputDto,
    });

    return this.prisma.aIGoalReview.create({
      data: {
        userId,
        goalId,
        aiInteractionId: interaction.id,
        clarityScore: data.clarityScore,
        strengths: data.strengths,
        weaknesses: data.weaknesses,
        missingElements: data.missingElements,
        suggestedVersion: data.suggestedVersion,
      },
    });
  }

  async acceptGoalReview(userId: string, reviewId: string) {
    const review = await this.prisma.aIGoalReview.findFirstOrThrow({
      where: {
        id: reviewId,
        userId,
        deletedAt: null,
        goal: { userId, status: GoalStatus.ACTIVE, deletedAt: null },
      },
    });

    const goal = await this.goalsService.update(userId, review.goalId, {
      title: review.suggestedVersion,
    });

    await this.prisma.aIGoalReview.update({
      where: { id: review.id },
      data: { acceptedAt: new Date() },
    });

    return goal;
  }

  async breakDownGoal(userId: string, goalId: string) {
    const context = await this.contextService.goal(userId, goalId);
    const { data, interaction } = await this.runFeature({
      userId,
      feature: AIFeature.GOAL_BREAKDOWN,
      schemaName: 'goal_breakdown',
      schema: goalBreakdownSchema,
      instructions: goalBreakdownInstructions,
      context,
      dtoClass: GoalBreakdownOutputDto,
    });

    return this.prisma.aIGoalBreakdown.create({
      data: {
        userId,
        goalId,
        aiInteractionId: interaction.id,
        milestones: data.milestones,
        phases: data.phases,
        suggestedTimeline: data.suggestedTimeline,
        dependencies: data.dependencies,
        successIndicators: data.successIndicators,
      },
    });
  }

  async recommendRoutines(
    userId: string,
    goalId: string,
    dto: RoutineRecommendationRequestDto,
  ) {
    const context = await this.contextService.goalPlanning(
      userId,
      goalId,
      dto.availableHoursPerWeek,
    );
    const { data, interaction } = await this.runFeature({
      userId,
      feature: AIFeature.ROUTINE_RECOMMENDATION,
      schemaName: 'routine_recommendations',
      schema: routineRecommendationsSchema,
      instructions: routineRecommendationInstructions,
      context,
      dtoClass: RoutineRecommendationsOutputDto,
    });

    return this.prisma.aIRoutineRecommendationBatch.create({
      data: {
        userId,
        goalId,
        aiInteractionId: interaction.id,
        availableHoursPerWeek: dto.availableHoursPerWeek,
        recommendations: this.toJson(data.recommendedRoutines),
      },
    });
  }

  async acceptRoutineRecommendations(
    userId: string,
    batchId: string,
    dto: AcceptRoutineRecommendationsDto,
  ) {
    const batch = await this.prisma.aIRoutineRecommendationBatch.findFirstOrThrow({
      where: {
        id: batchId,
        userId,
        status: AIRoutineRecommendationStatus.PENDING,
        deletedAt: null,
        goal: { userId, status: GoalStatus.ACTIVE, deletedAt: null },
      },
    });

    const recommendations = this.readRecommendations(batch.recommendations);
    const created: any[] = [];

    for (const index of dto.recommendationIndexes) {
      const recommendation = recommendations[index];
      if (!recommendation) {
        continue;
      }

      const routine = await this.routinesService.create(userId, {
        goalId: batch.goalId,
        title: recommendation.title,
        description: `${recommendation.description}\n\nWhy it matters: ${recommendation.whyItMatters}`,
        frequency: recommendation.frequency,
        targetCount: recommendation.targetCount,
        estimatedDuration: recommendation.estimatedDuration,
      });
      created.push(routine);
    }

    await this.prisma.aIRoutineRecommendationBatch.update({
      where: { id: batch.id },
      data: {
        status: AIRoutineRecommendationStatus.ACCEPTED,
        acceptedRoutineIds: this.toJson(created.map((routine) => routine.id)),
      },
    });

    return created;
  }

  async acceptAllRoutineRecommendations(userId: string, batchId: string) {
    const batch = await this.prisma.aIRoutineRecommendationBatch.findFirstOrThrow({
      where: {
        id: batchId,
        userId,
        status: AIRoutineRecommendationStatus.PENDING,
        deletedAt: null,
      },
    });
    const recommendations = this.readRecommendations(batch.recommendations);

    return this.acceptRoutineRecommendations(userId, batchId, {
      recommendationIndexes: recommendations.map((_, index) => index),
    });
  }

  async analyzeWeeklyReview(userId: string, weeklyReviewId: string) {
    await this.gateService.ensurePremium(userId);
    const existing = await this.prisma.aIWeeklyCoaching.findUnique({
      where: { weeklyReviewId },
    });
    if (existing) {
      return existing;
    }

    const context = await this.contextService.weeklyReview(userId, weeklyReviewId);
    const { data, interaction } = await this.runFeature({
      userId,
      feature: AIFeature.WEEKLY_COACH,
      schemaName: 'weekly_coach',
      schema: weeklyCoachSchema,
      instructions: weeklyCoachInstructions,
      context,
      dtoClass: WeeklyCoachOutputDto,
    });

    return this.prisma.aIWeeklyCoaching.create({
      data: {
        userId,
        weeklyReviewId,
        aiInteractionId: interaction.id,
        wins: data.wins,
        challenges: data.challenges,
        insights: data.insights,
        recommendations: data.recommendations,
      },
    });
  }

  async analyzeMonthlyReview(userId: string, monthlyReviewId: string) {
    await this.gateService.ensurePremium(userId);
    const existing = await this.prisma.aIMonthlyCoaching.findUnique({
      where: { monthlyReviewId },
    });
    if (existing) {
      return existing;
    }

    const context = await this.contextService.monthlyReview(userId, monthlyReviewId);
    const { data, interaction } = await this.runFeature({
      userId,
      feature: AIFeature.MONTHLY_COACH,
      schemaName: 'monthly_coach',
      schema: monthlyCoachSchema,
      instructions: monthlyCoachInstructions,
      context,
      dtoClass: MonthlyCoachOutputDto,
    });

    return this.prisma.aIMonthlyCoaching.create({
      data: {
        userId,
        monthlyReviewId,
        aiInteractionId: interaction.id,
        strengths: data.strengths,
        weaknesses: data.weaknesses,
        keyLessons: data.keyLessons,
        nextMonthPriorities: data.nextMonthPriorities,
        recommendedAdjustments: data.recommendedAdjustments,
      },
    });
  }

  async optimizeRoutines(userId: string) {
    const context = await this.contextService.routineOptimization(userId);
    const { data, interaction } = await this.runFeature({
      userId,
      feature: AIFeature.ROUTINE_OPTIMIZATION,
      schemaName: 'routine_optimization',
      schema: routineOptimizationSchema,
      instructions: routineOptimizationInstructions,
      context,
      dtoClass: RoutineOptimizationOutputDto,
    });

    return this.prisma.aIRoutineOptimization.create({
      data: {
        userId,
        aiInteractionId: interaction.id,
        suggestions: this.toJson(data.suggestions),
      },
    });
  }

  async progressInsights(userId: string) {
    const context = await this.contextService.progress(userId);
    const { data, interaction } = await this.runFeature({
      userId,
      feature: AIFeature.PROGRESS_INSIGHT,
      schemaName: 'progress_insight',
      schema: progressInsightSchema,
      instructions: progressInsightInstructions,
      context,
      dtoClass: ProgressInsightOutputDto,
    });

    return this.prisma.aIProgressInsight.create({
      data: {
        userId,
        aiInteractionId: interaction.id,
        summary: data.summary,
        insights: data.insights,
        opportunities: data.opportunities,
        risks: data.risks,
      },
    });
  }

  async coach(userId: string, dto: CoachMessageDto) {
    await this.prisma.aICoachMessage.create({
      data: { userId, role: 'USER', content: dto.message },
    });

    const context = await this.contextService.coach(userId, dto.message);
    const { data, interaction } = await this.runFeature({
      userId,
      feature: AIFeature.ACCOUNTABILITY_COACH,
      schemaName: 'accountability_coach',
      schema: coachSchema,
      instructions: accountabilityCoachInstructions,
      context,
      dtoClass: CoachOutputDto,
    });

    return this.prisma.aICoachMessage.create({
      data: {
        userId,
        role: 'ASSISTANT',
        content: `${data.response}\n\nAction items:\n${data.actionItems
          .map((item) => `- ${item}`)
          .join('\n')}`,
        aiInteractionId: interaction.id,
      },
    });
  }

  private async runFeature<T extends object>({
    userId,
    feature,
    schemaName,
    schema,
    instructions,
    context,
    dtoClass,
  }: AiRunOptions<T>) {
    await this.gateService.assertCanUse(userId, feature);

    try {
      const rawResult = await this.provider.generateStructured<T>({
        feature,
        schemaName,
        schema,
        instructions,
        context,
      });
      const data = this.validationService.validate(dtoClass, rawResult.data);
      const estimatedCost = this.costService.estimate(
        rawResult.promptTokens,
        rawResult.completionTokens,
      );
      const interaction = await this.createInteraction({
        userId,
        feature,
        status: AIInteractionStatus.SUCCESS,
        promptSummary: context,
        response: data,
        model: rawResult.model,
        promptTokens: rawResult.promptTokens,
        completionTokens: rawResult.completionTokens,
        estimatedCost,
      });

      await this.gateService.incrementUsage(userId, feature);

      return { data, interaction };
    } catch (error) {
      await this.createInteraction({
        userId,
        feature,
        status: AIInteractionStatus.FAILED,
        promptSummary: context,
        response: null,
        model: this.provider.getModel(),
        promptTokens: 0,
        completionTokens: 0,
        estimatedCost: 0,
        errorMessage: this.errorMessage(error),
      });

      if (
        error instanceof AiProviderUnavailableError ||
        error instanceof AiCircuitOpenError
      ) {
        throw new ServiceUnavailableException(
          'AI coaching is temporarily unavailable. Your tracking data is still safe.',
        );
      }

      if (error instanceof BadGatewayException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'AI coaching is temporarily unavailable. Please try again later.',
      );
    }
  }

  private createInteraction(data: {
    userId: string;
    feature: AIFeature;
    status: AIInteractionStatus;
    promptSummary: Record<string, unknown>;
    response: object | null;
    model: string;
    promptTokens: number;
    completionTokens: number;
    estimatedCost: number;
    errorMessage?: string;
  }): Promise<AIInteraction> {
    return this.prisma.aIInteraction.create({
      data: {
        ...data,
        promptSummary: this.toJson(data.promptSummary),
        response: data.response === null ? Prisma.DbNull : this.toJson(data.response),
      },
    });
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown AI error';
  }

  private toJson(value: unknown) {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private readRecommendations(value: Prisma.JsonValue) {
    const recommendations = Array.isArray(value) ? value : [];
    return this.validationService.validate(RoutineRecommendationsOutputDto, {
      recommendedRoutines: recommendations,
    }).recommendedRoutines as RoutineRecommendationDto[];
  }
}
