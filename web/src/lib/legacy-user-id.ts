import type { Id } from "../../../convex/_generated/dataModel";

const LEGACY_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isLegacyUuid(value: string): boolean {
  return LEGACY_UUID_RE.test(value);
}

export function asDirectConvexUserId(
  userId: string | undefined,
): Id<"users"> | undefined {
  if (!userId || isLegacyUuid(userId)) return undefined;
  return userId as Id<"users">;
}
