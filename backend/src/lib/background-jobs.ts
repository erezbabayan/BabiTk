const activeJobs = new Map<string, number>();

export function beginBackgroundJob(name: string): () => void {
  activeJobs.set(name, (activeJobs.get(name) ?? 0) + 1);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (activeJobs.get(name) ?? 1) - 1;
    if (count <= 0) {
      activeJobs.delete(name);
    } else {
      activeJobs.set(name, count);
    }
  };
}

export function getActiveBackgroundJobs(): string[] {
  return [...activeJobs.keys()];
}

export function hasActiveBackgroundJobs(): boolean {
  return activeJobs.size > 0;
}

export async function waitForBackgroundJobsIdle(options?: {
  pollMs?: number;
  timeoutMs?: number;
}): Promise<void> {
  const pollMs = options?.pollMs ?? 500;
  const timeoutMs = options?.timeoutMs ?? 5 * 60 * 1000;
  const startedAt = Date.now();

  while (hasActiveBackgroundJobs()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(
        `Timed out waiting for background jobs: ${getActiveBackgroundJobs().join(", ")}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
