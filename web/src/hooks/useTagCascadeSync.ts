import { useEffect, useRef } from "react";

import type { Id } from "../lib/ids";
import { getDemoItems, updateDemoItem } from "../lib/demo-store";
import {
  applyTagDefinitionDiffToTags,
  computeTagDefinitionDiff,
} from "../lib/tags";
import { useUserTags } from "./useUserTags";

/** Propagate tag definition renames/removals to local demo items. */
function useTagCascadeSyncOffline(_convexUserId: Id<"users"> | undefined) {
  const { tags, ready } = useUserTags();
  const prevRef = useRef<typeof tags | null>(null);

  useEffect(() => {
    if (!ready) return;

    if (prevRef.current === null) {
      prevRef.current = tags;
      return;
    }

    const diff = computeTagDefinitionDiff(
      prevRef.current.map((tag) => ({ name: tag.name })),
      tags.map((tag) => ({ name: tag.name })),
    );
    prevRef.current = tags;

    if (diff.removed.length === 0 && diff.renames.length === 0) return;

    void (async () => {
      const items = await getDemoItems();
      await Promise.all(
        items.map(async (item) => {
          const nextTags = applyTagDefinitionDiffToTags(item.tags ?? [], diff);
          if (
            nextTags.length === (item.tags ?? []).length &&
            nextTags.every((tag, i) => tag === (item.tags ?? [])[i])
          ) {
            return;
          }
          await updateDemoItem(item.id, { tags: nextTags });
        }),
      );
    })();
  }, [tags, ready]);
}

export const useTagCascadeSync = useTagCascadeSyncOffline;
