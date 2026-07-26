import type { Id } from "../_generated/dataModel";

const LEGACY_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isLegacyUuid(value: string): boolean {
  return LEGACY_UUID_RE.test(value);
}

/** Convex Auth sets legacyId to the user's own id on first sign-in. */
export function isSelfReferentialLegacyId(
  userId: Id<"users">,
  legacyId: string | undefined | null,
): boolean {
  if (!legacyId) return true;
  return legacyId === userId || legacyId === `${userId}`;
}

export function legacyIdMatchesAuthUser(
  userId: Id<"users">,
  legacyId: string,
): boolean {
  return legacyId === userId || legacyId === `${userId}`;
}

export function storedLegacyIdMatchesRequest(
  userId: Id<"users">,
  storedLegacyId: string | undefined | null,
  requestedLegacyId: string,
): boolean {
  if (storedLegacyId === requestedLegacyId) return true;
  if (legacyIdMatchesAuthUser(userId, requestedLegacyId)) {
    return isSelfReferentialLegacyId(userId, storedLegacyId);
  }
  return false;
}
