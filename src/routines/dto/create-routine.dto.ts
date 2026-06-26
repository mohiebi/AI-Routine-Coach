import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoutineFrequency } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRoutineDto {
  @ApiProperty()
  @IsString()
  goalId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(140)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: RoutineFrequency })
  @IsEnum(RoutineFrequency)
  frequency!: RoutineFrequency;

  @ApiProperty({ minimum: 1, maximum: 31 })
  @IsInt()
  @Min(1)
  @Max(31)
  targetCount!: number;

  @ApiPropertyOptional({ description: 'Estimated duration in minutes.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedDuration?: number;

  @ApiPropertyOptional({ description: 'Date after which this routine is no longer active (YYYY-MM-DD). Omit for a lifetime routine.' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
