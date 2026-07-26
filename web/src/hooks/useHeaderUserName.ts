import { useEffect, useMemo } from "react";

import {
  readCachedHeaderName,
  writeCachedHeaderName,
} from "../lib/header-name-cache";
import { resolveUserNameParts, type UserNameParts } from "../lib/user-display-name";

type ViewerNameSource = {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
} | null | undefined;

export function useHeaderUserName(input: {
  userId?: string | null;
  viewer?: ViewerNameSource;
  userMetadata?: Record<string, unknown> | null;
  fallback?: UserNameParts | null;
}): UserNameParts | null {
  const resolved = useMemo(
    () =>
      resolveUserNameParts({
        firstName: input.viewer?.firstName,
        lastName: input.viewer?.lastName,
        name: input.viewer?.name,
        userMetadata: input.userMetadata,
      }) ??
      input.fallback ??
      readCachedHeaderName(input.userId),
    [input.viewer, input.userMetadata, input.fallback, input.userId],
  );

  useEffect(() => {
    if (resolved) {
      writeCachedHeaderName(resolved, input.userId);
    }
  }, [resolved, input.userId]);

  return resolved;
}
