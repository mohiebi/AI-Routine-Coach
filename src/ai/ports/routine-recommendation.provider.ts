export interface RoutineRecommendationProvider {
  recommendRoutines(goalId: string): Promise<never>;
}

export const ROUTINE_RECOMMENDATION_PROVIDER = Symbol(
  'ROUTINE_RECOMMENDATION_PROVIDER',
);
