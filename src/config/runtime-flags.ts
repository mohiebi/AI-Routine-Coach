type SchedulerEnv = {
  NOW_REGION?: unknown;
  REDIS_HOST?: unknown;
  SCHEDULER_ENABLED?: unknown;
  VERCEL?: unknown;
  VERCEL_PROJECT_PRODUCTION_URL?: unknown;
  VERCEL_URL?: unknown;
};

function envString(value: unknown) {
  return typeof value === 'string' ? value.trim() : undefined;
}

export function isVercelRuntime(env: SchedulerEnv = process.env) {
  return Boolean(
    envString(env.VERCEL) === '1' ||
      envString(env.VERCEL_URL) ||
      envString(env.VERCEL_PROJECT_PRODUCTION_URL) ||
      envString(env.NOW_REGION),
  );
}

export function isSchedulerEnabled(env: SchedulerEnv = process.env) {
  if (isVercelRuntime(env)) {
    return false;
  }

  const configured = envString(env.SCHEDULER_ENABLED);
  if (configured === undefined) {
    return true;
  }

  return configured.toLowerCase() !== 'false';
}
