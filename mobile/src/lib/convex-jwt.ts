function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const base64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    if (typeof globalThis.atob !== "function") return null;
    const json = globalThis.atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Extract Convex user id from a Convex Auth JWT (`sub` is `userId|sessionId`). */
export function decodeConvexAuthUserIdFromJwt(token: string): string | null {
  const payload = decodeJwtPayload(token);
  const sub = payload?.sub;
  if (typeof sub !== "string") return null;

  const userId = sub.split("|")[0]?.trim();
  return userId ? userId : null;
}
