import { isSchedulerEnabled, isVercelRuntime } from './runtime-flags';

describe('runtime flags', () => {
  it('detects Vercel runtime from Vercel env variables', () => {
    expect(isVercelRuntime({ VERCEL: '1' })).toBe(true);
    expect(isVercelRuntime({ VERCEL_URL: 'app.vercel.app' })).toBe(true);
    expect(isVercelRuntime({ NOW_REGION: 'iad1' })).toBe(true);
  });

  it('disables scheduler on Vercel even if SCHEDULER_ENABLED is true', () => {
    expect(
      isSchedulerEnabled({
        SCHEDULER_ENABLED: 'true',
        VERCEL: '1',
      }),
    ).toBe(false);
  });

  it('uses SCHEDULER_ENABLED outside Vercel', () => {
    expect(isSchedulerEnabled({ SCHEDULER_ENABLED: 'false' })).toBe(false);
    expect(isSchedulerEnabled({ SCHEDULER_ENABLED: 'true' })).toBe(true);
    expect(isSchedulerEnabled({})).toBe(true);
  });
});
