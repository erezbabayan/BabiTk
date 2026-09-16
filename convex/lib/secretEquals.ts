/**
 * Compare secrets in roughly constant time.
 * Returns false when either side is missing — callers must fail closed.
 */
export function secretEquals(
  received: string | null | undefined,
  expected: string | undefined,
): boolean {
  if (typeof expected !== "string" || expected.length === 0) {
    return false;
  }
  if (typeof received !== "string") {
    return false;
  }

  const max = Math.max(received.length, expected.length);
  let mismatch = received.length === expected.length ? 0 : 1;
  for (let i = 0; i < max; i++) {
    const a = received.charCodeAt(i) || 0;
    const b = expected.charCodeAt(i) || 0;
    mismatch |= a ^ b;
  }
  return mismatch === 0;
}
