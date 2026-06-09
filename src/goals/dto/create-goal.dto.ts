import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GoalStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateGoalDto {
  @ApiProperty()
  @IsString()
  @MaxLength(140)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ example: '2026-06-09' })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @ApiPropertyOptional({ enum: GoalStatus })
  @IsOptional()
  @IsEnum(GoalStatus)
  status?: GoalStatus;
}
