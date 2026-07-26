import { useCallback, useEffect, useRef, useState } from "react";
import { useUserTags } from "./useUserTags";
import {
  buildTagSettingsDraft,
  countFilledTagDraft,
  draftRowsToPayload,
  hasDuplicateTagNames,
  payloadShrinksTagList,
  reconcileTagSettingsDraft,
  tagPayloadsEqual,
  userTagsToPayload,
  type TagDraftRow,
} from "../lib/tags";

const AUTO_SAVE_MS = 700;

export function useTagSettingsDraft(active = true) {
  const { tags, save, ready, loading, reset, refresh } = useUserTags();
  const [draft, setDraft] = useState<TagDraftRow[]>(() => buildTagSettingsDraft(tags, ready));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [synced, setSynced] = useState(true);
  const dirtyRef = useRef(false);
  const allowRemovalsRef = useRef(false);
  const draftRef = useRef(draft);
  const tagsRef = useRef(tags);
  const pendingPayloadRef = useRef<{ name: string; color: string }[] | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  draftRef.current = draft;
  tagsRef.current = tags;

  useEffect(() => {
    if (!active) return;
    void refresh();
  }, [active, refresh]);

  useEffect(() => {
    if (!ready) return;

    const next = reconcileTagSettingsDraft(tags, draftRef.current, pendingPayloadRef.current);
    if (next !== draftRef.current) {
      draftRef.current = next;
      setDraft(next);
    }

    if (tagPayloadsEqual(userTagsToPayload(tags), draftRowsToPayload(next))) {
      dirtyRef.current = false;
      allowRemovalsRef.current = false;
      pendingPayloadRef.current = null;
      setSynced(true);
      setError(null);
    }
  }, [tags, ready]);

  const flushSave = useCallback(async (): Promise<boolean> => {
    if (!ready) return false;

    const currentDraft = draftRef.current;
    const cleaned = draftRowsToPayload(currentDraft);
    if (cleaned.length === 0) {
      setError("נדרשת לפחות תגית אחת");
      setSynced(false);
      return false;
    }
    if (hasDuplicateTagNames(currentDraft)) {
      setError("יש תגיות עם שמות כפולים");
      setSynced(false);
      return false;
    }

    const currentPayload = userTagsToPayload(tagsRef.current);
    if (tagPayloadsEqual(cleaned, currentPayload)) {
      dirtyRef.current = false;
      allowRemovalsRef.current = false;
      pendingPayloadRef.current = null;
      setSynced(true);
      setError(null);
      return true;
    }

    // Only block net deletions unless the user clicked "מחק".
    // Adds and renames (same or greater count) must always save.
    if (!allowRemovalsRef.current && payloadShrinksTagList(currentPayload, cleaned)) {
      setError("למחיקת תגית לחץ על מחק — ניקוי השם לא מוחק");
      setSynced(false);
      return false;
    }

    pendingPayloadRef.current = cleaned;
    setSaving(true);
    setError(null);
    try {
      await save(cleaned);
      dirtyRef.current = false;
      allowRemovalsRef.current = false;
      pendingPayloadRef.current = null;
      setSynced(true);
      return true;
    } catch (err) {
      pendingPayloadRef.current = null;
      setError(err instanceof Error ? err.message : "שמירה נכשלה");
      setSynced(false);
      return false;
    } finally {
      setSaving(false);
    }
  }, [ready, save]);

  useEffect(() => {
    if (!active || !ready || !dirtyRef.current) return;

    const cleaned = draftRowsToPayload(draft);
    if (cleaned.length === 0) return;
    if (hasDuplicateTagNames(draft)) {
      setError("יש תגיות עם שמות כפולים");
      setSynced(false);
      return;
    }

    const currentPayload = userTagsToPayload(tags);
    if (tagPayloadsEqual(cleaned, currentPayload)) {
      dirtyRef.current = false;
      allowRemovalsRef.current = false;
      pendingPayloadRef.current = null;
      setSynced(true);
      setError(null);
      return;
    }

    // Wait while a name field is empty in a way that would shrink the list.
    if (!allowRemovalsRef.current && payloadShrinksTagList(currentPayload, cleaned)) {
      setSynced(false);
      return;
    }

    setSynced(false);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void flushSave();
    }, AUTO_SAVE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [active, draft, flushSave, ready, tags]);

  useEffect(() => {
    if (!active) return;
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (dirtyRef.current) void flushSave();
    };
  }, [active, flushSave]);

  function updateTag(index: number, patch: Partial<TagDraftRow>) {
    dirtyRef.current = true;
    setSynced(false);
    setError(null);
    setDraft((current) =>
      current.map((tag, i) => (i === index ? { ...tag, ...patch } : tag)),
    );
  }

  function removeTag(index: number) {
    const current = draftRef.current;
    const row = current[index];
    if (!row?.name.trim()) return;
    if (countFilledTagDraft(current) <= 1) return;

    const nextDraft = current.map((tag, i) => (i === index ? { ...tag, name: "" } : tag));
    draftRef.current = nextDraft;
    pendingPayloadRef.current = draftRowsToPayload(nextDraft);
    allowRemovalsRef.current = true;
    dirtyRef.current = true;
    setSynced(false);
    setError(null);
    setDraft(nextDraft);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    void flushSave();
  }

  const resetToDefaults = useCallback(async (): Promise<boolean> => {
    dirtyRef.current = false;
    allowRemovalsRef.current = false;
    pendingPayloadRef.current = null;
    setError(null);
    setSaving(true);
    try {
      await reset();
      setSynced(true);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "איפוס נכשל");
      setSynced(false);
      return false;
    } finally {
      setSaving(false);
    }
  }, [reset]);

  return {
    draft,
    updateTag,
    removeTag,
    flushSave,
    resetToDefaults,
    filledCount: countFilledTagDraft(draft),
    saving,
    loading,
    ready,
    error,
    synced,
  };
}
