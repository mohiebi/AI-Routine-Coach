export interface GoalAnalysisProvider {
  analyzeGoalHealth(goalId: string): Promise<never>;
}

export const GOAL_ANALYSIS_PROVIDER = Symbol('GOAL_ANALYSIS_PROVIDER');
