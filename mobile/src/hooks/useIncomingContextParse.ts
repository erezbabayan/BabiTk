import { useEffect, useRef, useState } from "react";

import {
  CONTEXT_PARSED_AT_KEY,
  parseIncomingMessage,
  parsedItemInsertFields,
} from "../../../convex/lib/ingest/parseIncomingMessage";
import { DEFAULT_TAG_NAMES } from "../../../convex/lib/ingest/defaultTags";
import { isDemoMode, requireSupabase, type MindtaskerItem } from "../lib/supabase";

const RECENT_MS = 72 * 60 * 60 * 1000;

function resolveAllowedTagNames(names: string[] | null | undefined): string[] {
  const cleaned = (names ?? []).map((name) => name.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : DEFAULT_TAG_NAMES;
}

function isVoicePlaceholder(title: string, content: string): boolean {
  const texts = [title, content].map((value) => value.trim());
  return texts.some(
    (value) =>
      value === "ממתין לתמלול" ||
      value === "מתמלל…" ||
      value === "הודעה קולית" ||
      value.startsWith("הודעה קולית"),
  );
}

function itemNeedsContextParse(item: MindtaskerItem): boolean {
  const metadata = item.metadata;
  if (metadata && typeof metadata === "object" && CONTEXT_PARSED_AT_KEY in metadata) {
    return false;
  }
  if (isVoicePlaceholder(item.title ?? "", item.content ?? "")) {
    return false;
  }
  const text = `${item.title ?? ""}\n${item.content ?? ""}`.trim();
  if (!text) return false;
  const created = Date.parse(item.created_at ?? "");
  if (Number.isFinite(created) && Date.now() - created > RECENT_MS) {
    return false;
  }
  return true;
}

/**
 * Parse recent inbound items and apply context tags (WhatsApp / voice / typed).
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

    const parsed = parseIncomingMessage(`${next.title}\n${next.content}`, {
      allowedTags: resolveAllowedTagNames(tagsRef.current),
    })[0];
    if (!parsed) {
      failedIds.current.add(next.id);
      return;
    }
    const fields = parsedItemInsertFields(parsed, {
      ...(typeof next.metadata === "object" && next.metadata ? next.metadata : {}),
    });

    busyRef.current = true;
    inFlight.current.add(next.id);
    void onPatchRef
      .current(next.id, fields)
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
