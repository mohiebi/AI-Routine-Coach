import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AiService } from './ai.service';
import {
  AcceptRoutineRecommendationsDto,
  CoachMessageDto,
  RoutineRecommendationRequestDto,
  SetSubscriptionDto,
} from './dto/ai-request.dto';

@ApiTags('ai')
@Controller('users/:userId/ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Patch('subscription')
  @ApiOperation({ summary: 'Set internal subscription flag for testing/admin use.' })
  setSubscription(
    @Param('userId') userId: string,
    @Body() dto: SetSubscriptionDto,
  ) {
    return this.aiService.setSubscription(userId, dto);
  }

  @Post('goals/:goalId/review')
  @ApiOperation({ summary: 'Premium: review goal quality with AI.' })
  reviewGoal(@Param('userId') userId: string, @Param('goalId') goalId: string) {
    return this.aiService.reviewGoal(userId, goalId);
  }

  @Post('goal-reviews/:reviewId/accept')
  @ApiOperation({ summary: 'Accept an AI suggested goal version.' })
  acceptGoalReview(
    @Param('userId') userId: string,
    @Param('reviewId') reviewId: string,
  ) {
    return this.aiService.acceptGoalReview(userId, reviewId);
  }

  @Post('goals/:goalId/breakdown')
  @ApiOperation({ summary: 'Premium: break a goal into milestones and phases.' })
  breakDownGoal(
    @Param('userId') userId: string,
    @Param('goalId') goalId: string,
  ) {
    return this.aiService.breakDownGoal(userId, goalId);
  }

  @Post('goals/:goalId/routine-recommendations')
  @ApiOperation({ summary: 'Premium: recommend routines for a goal.' })
  recommendRoutines(
    @Param('userId') userId: string,
    @Param('goalId') goalId: string,
    @Body() dto: RoutineRecommendationRequestDto,
  ) {
    return this.aiService.recommendRoutines(userId, goalId, dto);
  }

  @Post('routine-recommendations/:batchId/accept')
  @ApiOperation({ summary: 'Accept selected AI routine recommendations.' })
  acceptRoutineRecommendations(
    @Param('userId') userId: string,
    @Param('batchId') batchId: string,
    @Body() dto: AcceptRoutineRecommendationsDto,
  ) {
    return this.aiService.acceptRoutineRecommendations(userId, batchId, dto);
  }

  @Post('weekly-reviews/:weeklyReviewId/analyze')
  @ApiOperation({ summary: 'Premium: analyze a generated weekly review.' })
  analyzeWeeklyReview(
    @Param('userId') userId: string,
    @Param('weeklyReviewId') weeklyReviewId: string,
  ) {
    return this.aiService.analyzeWeeklyReview(userId, weeklyReviewId);
  }

  @Post('monthly-reviews/:monthlyReviewId/analyze')
  @ApiOperation({ summary: 'Premium: analyze a generated monthly review.' })
  analyzeMonthlyReview(
    @Param('userId') userId: string,
    @Param('monthlyReviewId') monthlyReviewId: string,
  ) {
    return this.aiService.analyzeMonthlyReview(userId, monthlyReviewId);
  }

  @Post('routines/optimize')
  @ApiOperation({ summary: 'Premium: suggest routine optimizations.' })
  optimizeRoutines(@Param('userId') userId: string) {
    return this.aiService.optimizeRoutines(userId);
  }

  @Post('progress/insights')
  @ApiOperation({ summary: 'Premium: generate AI progress insights.' })
  progressInsights(@Param('userId') userId: string) {
    return this.aiService.progressInsights(userId);
  }

  @Post('coach')
  @ApiOperation({ summary: 'Premium: send a message to the accountability coach.' })
  coach(@Param('userId') userId: string, @Body() dto: CoachMessageDto) {
    return this.aiService.coach(userId, dto);
  }
}
