export interface WeeklyReviewAnalysisProvider {
  analyzeWeeklyReview(reviewId: string): Promise<never>;
}

export const WEEKLY_REVIEW_ANALYSIS_PROVIDER = Symbol(
  'WEEKLY_REVIEW_ANALYSIS_PROVIDER',
);
