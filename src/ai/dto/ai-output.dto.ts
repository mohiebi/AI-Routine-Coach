import { RoutineFrequency } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GoalReviewOutputDto {
  @IsInt()
  @Min(0)
  @Max(100)
  clarityScore!: number;

  @IsArray()
  @IsString({ each: true })
  strengths!: string[];

  @IsArray()
  @IsString({ each: true })
  weaknesses!: string[];

  @IsArray()
  @IsString({ each: true })
  missingElements!: string[];

  @IsString()
  suggestedVersion!: string;
}

export class GoalBreakdownOutputDto {
  @IsArray()
  @IsString({ each: true })
  milestones!: string[];

  @IsArray()
  @IsString({ each: true })
  phases!: string[];

  @IsArray()
  @IsString({ each: true })
  suggestedTimeline!: string[];

  @IsArray()
  @IsString({ each: true })
  dependencies!: string[];

  @IsArray()
  @IsString({ each: true })
  successIndicators!: string[];
}

export class RoutineRecommendationDto {
  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsEnum(RoutineFrequency)
  frequency!: RoutineFrequency;

  @IsInt()
  @Min(1)
  @Max(31)
  targetCount!: number;

  @IsInt()
  @Min(1)
  estimatedDuration!: number;

  @IsString()
  whyItMatters!: string;
}

export class RoutineRecommendationsOutputDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoutineRecommendationDto)
  recommendedRoutines!: RoutineRecommendationDto[];
}

export class WeeklyCoachOutputDto {
  @IsArray()
  @IsString({ each: true })
  wins!: string[];

  @IsArray()
  @IsString({ each: true })
  challenges!: string[];

  @IsArray()
  @IsString({ each: true })
  insights!: string[];

  @IsArray()
  @IsString({ each: true })
  recommendations!: string[];
}

export class MonthlyCoachOutputDto {
  @IsArray()
  @IsString({ each: true })
  strengths!: string[];

  @IsArray()
  @IsString({ each: true })
  weaknesses!: string[];

  @IsArray()
  @IsString({ each: true })
  keyLessons!: string[];

  @IsArray()
  @IsString({ each: true })
  nextMonthPriorities!: string[];

  @IsArray()
  @IsString({ each: true })
  recommendedAdjustments!: string[];
}

export class RoutineOptimizationSuggestionDto {
  @IsString()
  action!: string;

  @IsOptional()
  @IsString()
  routineTitle?: string;

  @IsString()
  suggestion!: string;

  @IsString()
  reason!: string;
}

export class RoutineOptimizationOutputDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoutineOptimizationSuggestionDto)
  suggestions!: RoutineOptimizationSuggestionDto[];
}

export class ProgressInsightOutputDto {
  @IsString()
  summary!: string;

  @IsArray()
  @IsString({ each: true })
  insights!: string[];

  @IsArray()
  @IsString({ each: true })
  opportunities!: string[];

  @IsArray()
  @IsString({ each: true })
  risks!: string[];
}

export class CoachOutputDto {
  @IsString()
  response!: string;

  @IsArray()
  @IsString({ each: true })
  actionItems!: string[];
}
