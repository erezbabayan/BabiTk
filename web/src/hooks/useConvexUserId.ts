import type { Id } from "../lib/ids";

function useConvexUserIdOffline(
  _legacyUserId: string | undefined,
  _email?: string,
): { convexUserId: Id<"users"> | undefined; resolving: boolean } {
  return { convexUserId: undefined, resolving: false };
}

export const useConvexUserId = useConvexUserIdOffline;
