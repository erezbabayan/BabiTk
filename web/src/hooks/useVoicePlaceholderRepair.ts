import { useEffect, useRef, useState } from "react";

import { itemNeedsVoiceRepair } from "../lib/voice-text";
import { invokeTranscribeVoiceItem } from "../lib/transcribe-voice-item";
import { isDemoMode } from "../lib/supabase";
import type { MindtaskerItem } from "../types";

/**
 * Repair leftover WhatsApp voice placeholders one at a time.
 * The Edge Function writes the transcript; this only patches local state.
 */
export function useVoicePlaceholderRepair(
  items: MindtaskerItem[],
  enabled: boolean,
  onRepaired: (id: string, patch: Pick<MindtaskerItem, "title" | "content">) => void,
): void {
  const failedIds = useRef(new Set<string>());
  const inFlight = useRef(new Set<string>());
  const busyRef = useRef(false);
  const onRepairedRef = useRef(onRepaired);
  const [tick, setTick] = useState(0);
  onRepairedRef.current = onRepaired;

  useEffect(() => {
    if (!enabled || isDemoMode || busyRef.current) return;
    const next = items.find(
      (item) =>
        itemNeedsVoiceRepair(item) &&
        !failedIds.current.has(item.id) &&
        !inFlight.current.has(item.id),
    );
    if (!next) return;

    busyRef.current = true;
    inFlight.current.add(next.id);
    void invokeTranscribeVoiceItem(next.id)
      .then((result) => {
        onRepairedRef.current(next.id, { title: result.title, content: result.content });
      })
      .catch(() => {
        failedIds.current.add(next.id);
      })
      .finally(() => {
        inFlight.current.delete(next.id);
        busyRef.current = false;
        setTick((value) => value + 1);
      });
  }, [items, enabled, tick]);
}
