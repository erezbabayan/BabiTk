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

import { getUserTagsApi, saveUserTagsApi } from "../lib/api";
import { usesLocalUserTags } from "../lib/auth-mode";
import {
  MAX_USER_TAGS,
  UNIFIED_TAGS_MIGRATION_KEY,
  defaultUserTagsPayload,
  mergeMissingDefaultTags,
  normalizeTagName,
  type UserTag,
} from "../lib/tags";
import { isSyncEnabled } from "../lib/sync-client";
import { isDemoMode } from "../lib/supabase";
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
      const stored = loadStoredUserTags();
      const base = stored ?? demoTagsLocal();
      const merged = mergeMissingDefaultTags(
        base.map((tag) => ({ name: tag.name, color: tag.color })),
      );
      if (merged.length !== base.length) {
        setTags(saveStoredUserTags(merged));
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
      const next = await getUserTagsApi();
      if (fetchStartedAt < lastWriteAtRef.current) return;
      if (generationAtStart !== syncGenerationRef.current) return;
      applyTags(next, syncGenerationRef.current);
    } catch (err) {
      if (generationAtStart !== syncGenerationRef.current) return;
      if (fetchStartedAt < lastWriteAtRef.current) return;
      const stored = loadStoredUserTags();
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
    if (usesLocalUserTags()) return saveStoredUserTags(nextTags);
    try {
      return await saveUserTagsApi(nextTags);
    } catch (err) {
      if (isDemoMode) {
        console.warn("Tag save sync failed, using local cache", err);
        return saveStoredUserTags(nextTags);
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
    if (isSyncEnabled()) return;
    let cancelled = false;
    void (async () => {
      try {
        if (localStorage.getItem(UNIFIED_TAGS_MIGRATION_KEY)) return;
        const merged = mergeMissingDefaultTags(
          tagsRef.current.map((tag) => ({ name: tag.name, color: tag.color })),
        );
        if (merged.length !== tagsRef.current.length || tagsRef.current.length === 0) {
          await save(merged.length > 0 ? merged : defaultUserTagsPayload());
        }
        if (!cancelled) localStorage.setItem(UNIFIED_TAGS_MIGRATION_KEY, "1");
      } catch {
        // allow retry on next load
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
}: {
  children: ReactNode;
  userId?: string | null;
  userEmail?: string;
}) {
  return <LegacyUserTagsProvider>{children}</LegacyUserTagsProvider>;
}

export function useUserTags(): UserTagsContextValue {
  const ctx = useContext(UserTagsContext);
  if (!ctx) {
    throw new Error("useUserTags must be used within UserTagsProvider");
  }
  return ctx;
}
