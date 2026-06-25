import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  AiCircuitOpenError,
  AiProviderUnavailableError,
  AiStructuredRequest,
  AiStructuredResult,
} from '../ai.types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class OpenAiProvider {
  private readonly client?: OpenAI;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly failureThreshold: number;
  private readonly resetMs: number;
  private failureCount = 0;
  private circuitOpenedAt?: number;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.model = this.configService.get<string>('OPENAI_MODEL', 'gpt-4o-mini');
    this.timeoutMs = this.configService.get<number>('OPENAI_TIMEOUT_MS', 20000);
    this.maxRetries = this.configService.get<number>('OPENAI_MAX_RETRIES', 2);
    this.failureThreshold = this.configService.get<number>(
      'OPENAI_CIRCUIT_FAILURE_THRESHOLD',
      5,
    );
    this.resetMs = this.configService.get<number>('OPENAI_CIRCUIT_RESET_MS', 60000);

    if (apiKey) {
      this.client = new OpenAI({
        apiKey,
        timeout: this.timeoutMs,
        maxRetries: 0,
      });
    }
  }

  getModel() {
    return this.model;
  }

  isCircuitOpen() {
    if (!this.circuitOpenedAt) {
      return false;
    }

    if (Date.now() - this.circuitOpenedAt >= this.resetMs) {
      this.failureCount = 0;
      this.circuitOpenedAt = undefined;
      return false;
    }

    return true;
  }

  async generateStructured<T>(
    request: AiStructuredRequest,
  ): Promise<AiStructuredResult<T>> {
    if (!this.client) {
      throw new AiProviderUnavailableError('OpenAI API key is not configured');
    }

    if (this.isCircuitOpen()) {
      throw new AiCircuitOpenError();
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await this.client.responses.create({
          model: this.model,
          instructions: request.instructions,
          input: JSON.stringify({
            feature: request.feature,
            context: request.context,
          }),
          text: {
            format: {
              type: 'json_schema',
              name: request.schemaName,
              strict: true,
              schema: request.schema,
            },
          },
        } as any);

        const outputText = (response as any).output_text;
        if (!outputText || typeof outputText !== 'string') {
          throw new Error('OpenAI response did not include output_text');
        }

        this.failureCount = 0;
        this.circuitOpenedAt = undefined;

        return {
          data: JSON.parse(outputText) as T,
          model: this.model,
          promptTokens: (response as any).usage?.input_tokens ?? 0,
          completionTokens: (response as any).usage?.output_tokens ?? 0,
        };
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries) {
          await sleep(250 * 2 ** attempt);
        }
      }
    }

    this.failureCount += 1;
    if (this.failureCount >= this.failureThreshold) {
      this.circuitOpenedAt = Date.now();
    }

    throw lastError instanceof Error ? lastError : new Error('OpenAI request failed');
  }
}
