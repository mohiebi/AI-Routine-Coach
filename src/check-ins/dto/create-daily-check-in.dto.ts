import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateDailyCheckInDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  obstacles?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  wins?: string;
}
