import { AIFeature } from '@prisma/client';

export type JsonObject = Record<string, unknown>;

export interface AiStructuredRequest {
  feature: AIFeature;
  schemaName: string;
  schema: JsonObject;
  instructions: string;
  context: JsonObject;
}

export interface AiStructuredResult<T> {
  data: T;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export interface AiUsageLimit {
  feature: AIFeature;
  monthlyLimit: number;
}

export class AiProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiProviderUnavailableError';
  }
}

export class AiCircuitOpenError extends Error {
  constructor() {
    super('OpenAI circuit breaker is open');
    this.name = 'AiCircuitOpenError';
  }
}
