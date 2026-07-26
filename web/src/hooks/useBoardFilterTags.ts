import { useMemo } from "react";
import { unifiedFilterTags } from "../lib/filter-items";
import { useUserTags } from "./useUserTags";

/** Tag names for filters, wheel, and lists — live-synced from UserTagsProvider. */
export function useBoardFilterTags() {
  const { tags } = useUserTags();
  return useMemo(() => unifiedFilterTags(tags), [tags]);
}
