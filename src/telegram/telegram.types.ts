export type ConversationStep =
  // Goal creation
  | 'goal:title' | 'goal:description' | 'goal:category' | 'goal:startDate' | 'goal:targetDate'
  // Goal editing
  | 'goal_edit:title' | 'goal_edit:desc' | 'goal_edit:cat' | 'goal_edit:date'
  // Routine creation
  | 'routine:title' | 'routine:description' | 'routine:frequency'
  | 'routine:targetCount' | 'routine:duration' | 'routine:endDate'
  // Routine editing
  | 'routine_edit:title' | 'routine_edit:desc' | 'routine_edit:freq'
  | 'routine_edit:count' | 'routine_edit:dur'
  // Check-in
  | 'checkin:notes' | 'checkin:obstacles' | 'checkin:wins'
  // Monthly reflection
  | 'reflection:wentWell' | 'reflection:heldBack' | 'reflection:nextFocus'
  // Checkout
  | 'checkout:coupon'
  | 'payment:tx'
  // AI coach
  | 'ai_coach:active';

export interface ConversationState {
  step: ConversationStep;
  data: Record<string, string>;
}
