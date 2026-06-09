import { ApiPropertyOptional } from '@nestjs/swagger';
import { WeekStartDay } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ example: 'Asia/Tehran' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ enum: WeekStartDay })
  @IsOptional()
  @IsEnum(WeekStartDay)
  weekStartDay?: WeekStartDay;

  @ApiPropertyOptional({ example: '07:00' })
  @IsOptional()
  @Matches(timePattern)
  morningReminderTime?: string;

  @ApiPropertyOptional({ example: '21:00' })
  @IsOptional()
  @Matches(timePattern)
  eveningCheckInTime?: string;

  @ApiPropertyOptional({ example: '20:00' })
  @IsOptional()
  @Matches(timePattern)
  weeklyReviewTime?: string;

  @ApiPropertyOptional({ example: '20:00' })
  @IsOptional()
  @Matches(timePattern)
  monthlyReviewTime?: string;
}
