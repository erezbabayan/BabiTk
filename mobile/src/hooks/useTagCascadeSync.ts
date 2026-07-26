import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useConvexBackend } from "../lib/data-backend";
import { getDemoItems, updateDemoItem } from "../lib/demo-store";
import { isDemoMode } from "../lib/supabase";
import {
  applyTagDefinitionDiffToTags,
  computeTagDefinitionDiff,
} from "../lib/tags";
import { useUserTags } from "./useUserTags";

/** Propagate tag definition renames/removals to Convex items and demo storage. */
export function useTagCascadeSync(convexUserId: Id<"users"> | undefined) {
  const convexBackend = useConvexBackend();
  const { tags, ready } = useUserTags();
  const prevRef = useRef<typeof tags | null>(null);
  const applyMutation = useMutation(api.tags.applyDefinitionChanges);

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

    if (isDemoMode) {
      void (async () => {
        const items = await getDemoItems();
        await Promise.all(
          items.map(async (item) => {
            const nextTags = applyTagDefinitionDiffToTags(item.tags ?? [], diff);
            if (nextTags.length === (item.tags ?? []).length && nextTags.every((tag, i) => tag === (item.tags ?? [])[i])) {
              return;
            }
            await updateDemoItem(item.id, { tags: nextTags });
          }),
        );
      })();
      return;
    }

    if (!convexBackend || !convexUserId) return;

    void applyMutation({
      userId: convexUserId,
      renames: diff.renames,
      removed: diff.removed,
    });
  }, [tags, ready, convexBackend, convexUserId, applyMutation]);
}
