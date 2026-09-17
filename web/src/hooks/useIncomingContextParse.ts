import { useEffect, useRef, useState } from "react";

import {
  contextParsePatch,
  itemNeedsContextParse,
  resolveAllowedTagNames,
} from "../lib/parse-incoming-message";
import { isDemoMode, requireSupabase } from "../lib/supabase";
import type { MindtaskerItem } from "../types";

/**
 * Parse recent inbound items and apply context tags (WhatsApp / voice / typed).
 * Runs once per item; skipped after metadata.context_parsed_at is set.
 */
export function useIncomingContextParse(
  items: MindtaskerItem[],
  userId: string | undefined,
  enabled: boolean,
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<void>,
): void {
  const failedIds = useRef(new Set<string>());
  const inFlight = useRef(new Set<string>());
  const busyRef = useRef(false);
  const onPatchRef = useRef(onPatch);
  const [tick, setTick] = useState(0);
  const tagsRef = useRef<string[]>([]);
  onPatchRef.current = onPatch;

  useEffect(() => {
    if (!enabled || !userId || isDemoMode) return;
    let cancelled = false;
    void (async () => {
      try {
        const supabase = requireSupabase();
        const { data } = await supabase
          .from("user_tags")
          .select("name")
          .eq("user_id", userId)
          .order("sort_order", { ascending: true });
        if (cancelled) return;
        tagsRef.current = resolveAllowedTagNames(
          (data ?? []).map((row) => (typeof row.name === "string" ? row.name : "")),
        );
      } catch {
        tagsRef.current = resolveAllowedTagNames([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, userId]);

  useEffect(() => {
    if (!enabled || !userId || isDemoMode || busyRef.current) return;
    const next = items.find(
      (item) =>
        itemNeedsContextParse(item) &&
        !failedIds.current.has(item.id) &&
        !inFlight.current.has(item.id),
    );
    if (!next) return;

    const patch = contextParsePatch(next, tagsRef.current);
    if (!patch) {
      failedIds.current.add(next.id);
      return;
    }

    busyRef.current = true;
    inFlight.current.add(next.id);
    void onPatchRef
      .current(next.id, patch)
      .catch(() => {
        failedIds.current.add(next.id);
      })
      .finally(() => {
        inFlight.current.delete(next.id);
        busyRef.current = false;
        setTick((value) => value + 1);
      });
  }, [items, enabled, userId, tick]);
}
