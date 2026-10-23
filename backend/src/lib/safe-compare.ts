import { timingSafeEqual } from "node:crypto";

/** Constant-time secret comparison; a length mismatch returns false without early exit on content. */
export function safeEqual(presented: string | undefined | null, expected: string | undefined | null): boolean {
  if (!presented || !expected) return false;
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}
