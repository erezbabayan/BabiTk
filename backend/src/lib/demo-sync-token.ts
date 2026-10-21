/** אסימון הסנכרון המקומי. ציבורי, ולכן אסור לקבל אותו בפרודקשן. */
export const DEFAULT_DEMO_SYNC_TOKEN = "mindtasker-local-sync";

export function configuredDemoSyncToken(): string {
  return process.env.DEMO_SYNC_TOKEN ?? DEFAULT_DEMO_SYNC_TOKEN;
}

export function acceptsDemoSyncToken(
  presented: string,
  options?: { nodeEnv?: string; configuredToken?: string },
): boolean {
  const nodeEnv = options?.nodeEnv ?? process.env.NODE_ENV;
  const configured = options?.configuredToken ?? configuredDemoSyncToken();
  if (nodeEnv === "production" && presented === DEFAULT_DEMO_SYNC_TOKEN) {
    return false;
  }
  return presented === configured;
}
