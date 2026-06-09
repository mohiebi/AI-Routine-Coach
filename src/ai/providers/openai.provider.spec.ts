import { ConfigService } from '@nestjs/config';
import { AIFeature } from '@prisma/client';
import { AiProviderUnavailableError } from '../ai.types';
import { OpenAiProvider } from './openai.provider';

describe('OpenAiProvider', () => {
  it('does not require an API key at boot and fails gracefully when invoked', async () => {
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'OPENAI_API_KEY') return undefined;
        return fallback;
      }),
    } as unknown as ConfigService;
    const provider = new OpenAiProvider(config);

    await expect(
      provider.generateStructured({
        feature: AIFeature.GOAL_REVIEW,
        schemaName: 'test',
        schema: { type: 'object', properties: {}, additionalProperties: false },
        instructions: 'Return JSON.',
        context: {},
      }),
    ).rejects.toThrow(AiProviderUnavailableError);
  });
});
