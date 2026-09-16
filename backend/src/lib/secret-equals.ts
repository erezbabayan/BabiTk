import { timingSafeEqual } from "node:crypto";

/**
 * Compare secrets in constant time. Missing values fail closed.
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

  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
