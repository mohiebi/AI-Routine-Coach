import { BadGatewayException } from '@nestjs/common';
import { AiValidationService } from './ai-validation.service';
import { GoalReviewOutputDto } from './dto/ai-output.dto';

describe('AiValidationService', () => {
  const service = new AiValidationService();

  it('accepts valid structured AI output', () => {
    const result = service.validate(GoalReviewOutputDto, {
      clarityScore: 75,
      strengths: ['Specific topic'],
      weaknesses: ['No timeline'],
      missingElements: ['Target date'],
      suggestedVersion: 'Learn backend development by building 3 APIs in 6 months.',
    });

    expect(result.clarityScore).toBe(75);
  });

  it('rejects malformed structured AI output', () => {
    expect(() =>
      service.validate(GoalReviewOutputDto, {
        clarityScore: 200,
        strengths: ['Specific topic'],
        weaknesses: ['No timeline'],
        missingElements: ['Target date'],
        suggestedVersion: 'Bad score should fail.',
      }),
    ).toThrow(BadGatewayException);
  });
});
