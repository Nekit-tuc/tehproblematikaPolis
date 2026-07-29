function performanceLogsEnabled() {
  return process.env.NODE_ENV === "development" || process.env.PERFORMANCE_LOGS === "1";
}

export function logDuration(label: string, startedAt: number) {
  if (!performanceLogsEnabled()) return;
  const duration = Math.round(performance.now() - startedAt);
  console.info(`[perf] ${label} ${duration}ms`);
}

export async function measureAsync<T>(label: string, fn: () => PromiseLike<T>): Promise<T> {
  if (!performanceLogsEnabled()) return await fn();
  const startedAt = performance.now();
  try {
    return await fn();
  } finally {
    logDuration(label, startedAt);
  }
}
