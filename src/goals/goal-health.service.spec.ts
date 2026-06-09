import { GoalHealthStatus } from '@prisma/client';
import { GoalHealthService } from './goal-health.service';

describe('GoalHealthService', () => {
  it.each([
    [0, GoalHealthStatus.OFF_TRACK],
    [39, GoalHealthStatus.OFF_TRACK],
    [40, GoalHealthStatus.AT_RISK],
    [69, GoalHealthStatus.AT_RISK],
    [70, GoalHealthStatus.ON_TRACK],
    [89, GoalHealthStatus.ON_TRACK],
    [90, GoalHealthStatus.EXCELLENT],
    [100, GoalHealthStatus.EXCELLENT],
  ])('maps score %s to %s', (score, expected) => {
    const service = new GoalHealthService({} as never);
    expect(service.toHealthStatus(score)).toBe(expected);
  });
});
