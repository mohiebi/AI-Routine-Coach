import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class SetSubscriptionDto {
  @ApiProperty({ enum: SubscriptionPlan })
  @IsEnum(SubscriptionPlan)
  plan!: SubscriptionPlan;

  @ApiProperty({ enum: SubscriptionStatus, default: SubscriptionStatus.ACTIVE })
  @IsEnum(SubscriptionStatus)
  status!: SubscriptionStatus;
}

export class RoutineRecommendationRequestDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 80 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(80)
  availableHoursPerWeek?: number;
}

export class AcceptRoutineRecommendationsDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  recommendationIndexes!: number[];
}

export class CoachMessageDto {
  @ApiProperty()
  @IsString()
  message!: string;
}
