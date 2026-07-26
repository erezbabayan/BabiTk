import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { getUserTags, saveUserTags } from "../lib/api";
import { usesConvexUserTags, usesLocalUserTags } from "../lib/auth-mode";
import { useConvexFeatures } from "../lib/data-backend";
import {
  MAX_USER_TAGS,
  UNIFIED_TAGS_MIGRATION_KEY,
  defaultUserTagsPayload,
  mergeMissingDefaultTags,
  normalizeTagName,
  type UserTag,
} from "../lib/tags";
import { isDemoMode } from "../lib/supabase";
import { isSyncEnabled } from "../lib/sync-client";
import { useConvexUserId } from "../hooks/useConvexUserId";
import {
  demoTagsLocal,
  loadStoredUserTags,
  saveStoredUserTags,
  toUserTags,
} from "../lib/user-tags-storage";

interface UserTagsContextValue {
  tags: UserTag[];
  loading: boolean;
  ready: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  save: (nextTags: { name: string; color: string }[]) => Promise<void>;
  addTag: (name: string, color: string) => Promise<void>;
  reset: () => Promise<void>;
}

const UserTagsContext = createContext<UserTagsContextValue | null>(null);

function mapConvexTags(
  rows: Array<{ _id: string; name: string; color: string; sortOrder: number }> | undefined,
): UserTag[] {
  if (!rows) return [];
  return rows.map((tag) => ({
    id: tag._id,
    name: tag.name,
    color: tag.color,
    sort_order: tag.sortOrder,
  }));
}

function ConvexUserTagsProvider({
  children,
  userId,
  userEmail,
}: {
  children: ReactNode;
  userId: string;
  userEmail?: string;
}) {
  const { convexUserId, resolving } = useConvexUserId(userId, userEmail);
  const rows = useQuery(
    api.userTagDefinitions.listForUser,
    convexUserId ? { userId: convexUserId } : "skip",
  );
  const ensureDefaults = useMutation(api.userTagDefinitions.ensureDefaultsForUser);
  const replaceTags = useMutation(api.userTagDefinitions.replaceForUser);
  const mergeExtras = useMutation(api.userTagDefinitions.mergeExtrasForUser);
  const ensuredForUser = useRef<string | null>(null);
  const migratedForUser = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!convexUserId) return;
    if (ensuredForUser.current === convexUserId) return;
    ensuredForUser.current = convexUserId;
    void ensureDefaults({ userId: convexUserId }).catch((err) => {
      console.warn("Tag defaults backfill failed", err);
      ensuredForUser.current = null;
    });
  }, [convexUserId, ensureDefaults]);

  // One-time: harvest tag names already used on items into Convex definitions.
  useEffect(() => {
    if (!convexUserId || rows === undefined) return;
    if (migratedForUser.current === convexUserId) return;
    migratedForUser.current = convexUserId;
    void (async () => {
      try {
        const key = `mindtasker:convex-tags-harvest-v1:${convexUserId}`;
        const done = await AsyncStorage.getItem(key);
        if (done) return;
        await mergeExtras({ userId: convexUserId, harvestFromItems: true });
        await AsyncStorage.setItem(key, "1");
      } catch (err) {
        console.warn("Tag harvest from items failed", err);
        migratedForUser.current = null;
      }
    })();
  }, [convexUserId, rows, mergeExtras]);

  const tags = useMemo(() => mapConvexTags(rows), [rows]);
  const loading = resolving || (Boolean(convexUserId) && rows === undefined) || saving;
  const ready = !resolving && rows !== undefined;

  const refresh = useCallback(async () => {}, []);

  const save = useCallback(
    async (nextTags: { name: string; color: string }[]) => {
      if (!convexUserId) throw new Error("משתמש לא מחובר");
      const cleaned = nextTags
        .map((tag) => ({ name: normalizeTagName(tag.name), color: tag.color }))
        .filter((tag) => tag.name.length > 0);
      if (cleaned.length === 0) throw new Error("נדרשת לפחות תגית אחת");

      setSaving(true);
      setError(null);
      try {
        await replaceTags({ userId: convexUserId, tags: cleaned });
      } catch (err) {
        setError(err instanceof Error ? err.message : "שמירת תגיות נכשלה");
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [convexUserId, replaceTags],
  );

  const addTag = useCallback(
    async (name: string, color: string) => {
      const trimmed = normalizeTagName(name);
      if (!trimmed) return;
      if (tags.length >= MAX_USER_TAGS) return;
      if (tags.some((tag) => normalizeTagName(tag.name) === trimmed)) return;
      await save([...tags.map((tag) => ({ name: tag.name, color: tag.color })), { name: trimmed, color }]);
    },
    [save, tags],
  );

  const reset = useCallback(async () => {
    await save(defaultUserTagsPayload());
  }, [save]);

  const value = useMemo(
    () => ({ tags, loading, ready, error, refresh, save, addTag, reset }),
    [tags, loading, ready, error, refresh, save, addTag, reset],
  );

  return <UserTagsContext.Provider value={value}>{children}</UserTagsContext.Provider>;
}

function LegacyUserTagsProvider({ children }: { children: ReactNode }) {
  const syncedDemoTags = isDemoMode && isSyncEnabled();
  const [tags, setTags] = useState<UserTag[]>(() => demoTagsLocal());
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tagsRef = useRef(tags);
  const syncGenerationRef = useRef(0);
  const lastWriteAtRef = useRef(0);
  tagsRef.current = tags;

  const applyTags = useCallback((next: UserTag[], generation: number) => {
    if (generation !== syncGenerationRef.current) return;
    setTags(next);
  }, []);

  const refresh = useCallback(async () => {
    if (usesLocalUserTags()) {
      const stored = await loadStoredUserTags();
      const base = stored ?? demoTagsLocal();
      const merged = mergeMissingDefaultTags(
        base.map((tag) => ({ name: tag.name, color: tag.color })),
      );
      if (merged.length !== base.length) {
        setTags(await saveStoredUserTags(merged));
      } else {
        setTags(base);
      }
      setLoading(false);
      setReady(true);
      setError(null);
      return;
    }

    const fetchStartedAt = Date.now();
    const generationAtStart = syncGenerationRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await getUserTags();
      const mergedPayload = mergeMissingDefaultTags(
        next.map((tag) => ({ name: tag.name, color: tag.color })),
      );
      const resolved =
        mergedPayload.length !== next.length ? await saveUserTags(mergedPayload) : next;
      if (fetchStartedAt < lastWriteAtRef.current) return;
      if (generationAtStart !== syncGenerationRef.current) return;
      applyTags(resolved, syncGenerationRef.current);
    } catch (err) {
      if (generationAtStart !== syncGenerationRef.current) return;
      if (fetchStartedAt < lastWriteAtRef.current) return;
      const stored = await loadStoredUserTags();
      if (stored) setTags(stored);
      else if (isDemoMode && tagsRef.current.length === 0) setTags(demoTagsLocal());
      setError(err instanceof Error ? err.message : "טעינת תגיות נכשלה");
    } finally {
      if (generationAtStart === syncGenerationRef.current) {
        setLoading(false);
        setReady(true);
      }
    }
  }, [applyTags]);

  const persist = useCallback(async (nextTags: { name: string; color: string }[]): Promise<UserTag[]> => {
    if (usesLocalUserTags()) return await saveStoredUserTags(nextTags);
    try {
      return await saveUserTags(nextTags);
    } catch (err) {
      if (isDemoMode) {
        console.warn("Tag save sync failed, using local cache", err);
        return await saveStoredUserTags(nextTags);
      }
      throw err;
    }
  }, []);

  const save = useCallback(
    async (nextTags: { name: string; color: string }[]) => {
      const cleaned = nextTags
        .map((tag) => ({ name: normalizeTagName(tag.name), color: tag.color }))
        .filter((tag) => tag.name.length > 0);
      if (cleaned.length === 0) throw new Error("נדרשת לפחות תגית אחת");

      syncGenerationRef.current += 1;
      const generation = syncGenerationRef.current;
      const previous = tagsRef.current;
      applyTags(toUserTags(cleaned), generation);
      lastWriteAtRef.current = Date.now();

      try {
        const saved = await persist(cleaned);
        lastWriteAtRef.current = Date.now();
        applyTags(saved, generation);
      } catch (err) {
        if (generation === syncGenerationRef.current) setTags(previous);
        throw err;
      }
    },
    [applyTags, persist],
  );

  const addTag = useCallback(
    async (name: string, color: string) => {
      const trimmed = normalizeTagName(name);
      if (!trimmed) return;
      const current = tagsRef.current;
      if (current.length >= MAX_USER_TAGS) return;
      if (current.some((tag) => normalizeTagName(tag.name) === trimmed)) return;
      await save([
        ...current.map((tag) => ({ name: tag.name, color: tag.color })),
        { name: trimmed, color },
      ]);
    },
    [save],
  );

  const reset = useCallback(async () => {
    await save(defaultUserTagsPayload());
  }, [save]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!ready) return;
    if (isSyncEnabled() && !usesLocalUserTags()) return;
    let cancelled = false;
    void (async () => {
      try {
        const done = await AsyncStorage.getItem(UNIFIED_TAGS_MIGRATION_KEY);
        if (cancelled || done) return;
        const merged = mergeMissingDefaultTags(
          tagsRef.current.map((tag) => ({ name: tag.name, color: tag.color })),
        );
        if (merged.length !== tagsRef.current.length || tagsRef.current.length === 0) {
          await save(merged.length > 0 ? merged : defaultUserTagsPayload());
        }
        if (!cancelled) await AsyncStorage.setItem(UNIFIED_TAGS_MIGRATION_KEY, "1");
      } catch {
        // retry next load
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, save]);

  useEffect(() => {
    if (!syncedDemoTags) return;
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [syncedDemoTags, refresh]);

  const value = useMemo(
    () => ({ tags, loading, ready, error, refresh, save, addTag, reset }),
    [tags, loading, ready, error, refresh, save, addTag, reset],
  );

  return <UserTagsContext.Provider value={value}>{children}</UserTagsContext.Provider>;
}

export function UserTagsProvider({
  children,
  userId,
  userEmail,
}: {
  children: ReactNode;
  userId?: string;
  userEmail?: string;
}) {
  const convexFeatures = useConvexFeatures();
  if (usesConvexUserTags() && convexFeatures && userId) {
    return (
      <ConvexUserTagsProvider userId={userId} userEmail={userEmail}>
        {children}
      </ConvexUserTagsProvider>
    );
  }
  return <LegacyUserTagsProvider>{children}</LegacyUserTagsProvider>;
}

export function useUserTags(): UserTagsContextValue {
  const ctx = useContext(UserTagsContext);
  if (!ctx) {
    throw new Error("useUserTags must be used within UserTagsProvider");
  }
  return ctx;
}
