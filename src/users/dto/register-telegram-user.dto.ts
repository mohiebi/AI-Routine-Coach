import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class RegisterTelegramUserDto {
  @ApiProperty()
  @IsInt()
  telegramId!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({ default: 'Asia/Tehran' })
  @IsString()
  timezone!: string;
}
