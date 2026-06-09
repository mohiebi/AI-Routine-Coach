import { plainToInstance } from 'class-transformer';
import {
  IsBooleanString,
  IsInt,
  IsOptional,
  IsString,
  Min,
  validateSync,
} from 'class-validator';

export class EnvironmentVariables {
  @IsString()
  DATABASE_URL!: string;

  @IsOptional()
  @IsString()
  REDIS_HOST?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  REDIS_PORT: number = 6379;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  @IsOptional()
  @IsString()
  TELEGRAM_BOT_TOKEN?: string;

  @IsOptional()
  @IsString()
  PROD_LINK?: string;

  @IsOptional()
  @IsString()
  VERCEL?: string;

  @IsOptional()
  @IsString()
  VERCEL_URL?: string;

  @IsOptional()
  @IsString()
  VERCEL_PROJECT_PRODUCTION_URL?: string;

  @IsOptional()
  @IsString()
  TELEGRAM_WEBHOOK_SECRET?: string;

  @IsOptional()
  @IsBooleanString()
  TELEGRAM_BOT_ENABLED?: string;

  @IsOptional()
  @IsBooleanString()
  SCHEDULER_ENABLED?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  PORT: number = 3000;
}

export function validateEnvironment(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  const schedulerEnabled =
    validatedConfig.SCHEDULER_ENABLED === undefined
      ? validatedConfig.VERCEL !== '1'
      : validatedConfig.SCHEDULER_ENABLED !== 'false';

  if (schedulerEnabled && !validatedConfig.REDIS_HOST) {
    throw new Error('REDIS_HOST is required when SCHEDULER_ENABLED is true');
  }

  return validatedConfig;
}
