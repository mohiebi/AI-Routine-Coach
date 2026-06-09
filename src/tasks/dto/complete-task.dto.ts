import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CompleteTaskDto {
  @IsEnum(TaskStatus)
  status!: TaskStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
