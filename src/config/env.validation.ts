import { plainToInstance } from 'class-transformer';
import {
  IsBooleanString,
  IsInt,
  IsNumber,
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

  @IsOptional()
  @IsString()
  OPENAI_API_KEY?: string;

  @IsOptional()
  @IsString()
  OPENAI_MODEL: string = 'gpt-5.4-mini';

  @IsOptional()
  @IsInt()
  @Min(1)
  OPENAI_TIMEOUT_MS: number = 20000;

  @IsOptional()
  @IsInt()
  @Min(0)
  OPENAI_MAX_RETRIES: number = 2;

  @IsOptional()
  @IsInt()
  @Min(1)
  OPENAI_CIRCUIT_FAILURE_THRESHOLD: number = 5;

  @IsOptional()
  @IsInt()
  @Min(1)
  OPENAI_CIRCUIT_RESET_MS: number = 60000;

  @IsOptional()
  @IsNumber()
  @Min(0)
  AI_INPUT_COST_PER_1M: number = 0.75;

  @IsOptional()
  @IsNumber()
  @Min(0)
  AI_OUTPUT_COST_PER_1M: number = 4.5;

  @IsOptional()
  @IsString()
  PAYMENT_RECEIVER_ETHEREUM_ADDRESS?: string;

  @IsOptional()
  @IsString()
  PAYMENT_RECEIVER_BSC_ADDRESS?: string;

  @IsOptional()
  @IsString()
  PAYMENT_RECEIVER_ARBITRUM_ADDRESS?: string;

  @IsOptional()
  @IsBooleanString()
  PAYMENT_CHAIN_ETHEREUM_ENABLED?: string;

  @IsOptional()
  @IsBooleanString()
  PAYMENT_CHAIN_BSC_ENABLED?: string;

  @IsOptional()
  @IsBooleanString()
  PAYMENT_CHAIN_ARBITRUM_ENABLED?: string;

  @IsOptional()
  @IsString()
  ETHERSCAN_API_KEY?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  PAYMENT_CHECKOUT_EXPIRES_MINUTES: number = 30;
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
