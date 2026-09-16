/** Structured security events — no secrets, tokens, or raw request bodies. */
export function logSecurityEvent(
  event: string,
  details?: Record<string, string | number | boolean | null>,
): void {
  console.warn("[security]", event, details ?? {});
}
