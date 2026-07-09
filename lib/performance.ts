export function logDuration(label: string, startedAt: number) {
  const duration = Math.round(performance.now() - startedAt);
  console.info(`[perf] ${label} ${duration}ms`);
}

export async function measureAsync<T>(label: string, fn: () => PromiseLike<T>): Promise<T> {
  const startedAt = performance.now();
  try {
    return await fn();
  } finally {
    logDuration(label, startedAt);
  }
}
