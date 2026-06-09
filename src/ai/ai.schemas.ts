export const goalReviewSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'clarityScore',
    'strengths',
    'weaknesses',
    'missingElements',
    'suggestedVersion',
  ],
  properties: {
    clarityScore: { type: 'integer', minimum: 0, maximum: 100 },
    strengths: { type: 'array', items: { type: 'string' } },
    weaknesses: { type: 'array', items: { type: 'string' } },
    missingElements: { type: 'array', items: { type: 'string' } },
    suggestedVersion: { type: 'string' },
  },
};

export const goalBreakdownSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'milestones',
    'phases',
    'suggestedTimeline',
    'dependencies',
    'successIndicators',
  ],
  properties: {
    milestones: { type: 'array', items: { type: 'string' } },
    phases: { type: 'array', items: { type: 'string' } },
    suggestedTimeline: { type: 'array', items: { type: 'string' } },
    dependencies: { type: 'array', items: { type: 'string' } },
    successIndicators: { type: 'array', items: { type: 'string' } },
  },
};

const routineRecommendation = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'description',
    'frequency',
    'targetCount',
    'estimatedDuration',
    'whyItMatters',
  ],
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    frequency: { type: 'string', enum: ['DAILY', 'WEEKLY', 'MONTHLY'] },
    targetCount: { type: 'integer', minimum: 1, maximum: 31 },
    estimatedDuration: { type: 'integer', minimum: 1 },
    whyItMatters: { type: 'string' },
  },
};

export const routineRecommendationsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['recommendedRoutines'],
  properties: {
    recommendedRoutines: {
      type: 'array',
      items: routineRecommendation,
    },
  },
};

export const weeklyCoachSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['wins', 'challenges', 'insights', 'recommendations'],
  properties: {
    wins: { type: 'array', items: { type: 'string' } },
    challenges: { type: 'array', items: { type: 'string' } },
    insights: { type: 'array', items: { type: 'string' } },
    recommendations: { type: 'array', items: { type: 'string' } },
  },
};

export const monthlyCoachSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'strengths',
    'weaknesses',
    'keyLessons',
    'nextMonthPriorities',
    'recommendedAdjustments',
  ],
  properties: {
    strengths: { type: 'array', items: { type: 'string' } },
    weaknesses: { type: 'array', items: { type: 'string' } },
    keyLessons: { type: 'array', items: { type: 'string' } },
    nextMonthPriorities: { type: 'array', items: { type: 'string' } },
    recommendedAdjustments: { type: 'array', items: { type: 'string' } },
  },
};

export const routineOptimizationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestions'],
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['action', 'routineTitle', 'suggestion', 'reason'],
        properties: {
          action: {
            type: 'string',
            enum: [
              'INCREASE_DIFFICULTY',
              'DECREASE_DIFFICULTY',
              'ADD_ROUTINE',
              'REMOVE_ROUTINE',
              'ADJUST_FREQUENCY',
            ],
          },
          routineTitle: { type: 'string' },
          suggestion: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
  },
};

export const progressInsightSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'insights', 'opportunities', 'risks'],
  properties: {
    summary: { type: 'string' },
    insights: { type: 'array', items: { type: 'string' } },
    opportunities: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
  },
};

export const coachSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['response', 'actionItems'],
  properties: {
    response: { type: 'string' },
    actionItems: { type: 'array', items: { type: 'string' } },
  },
};
