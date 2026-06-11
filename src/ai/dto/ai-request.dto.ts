import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

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
