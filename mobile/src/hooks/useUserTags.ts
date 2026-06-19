import { useCallback, useEffect, useState } from "react";
import { getUserTags, saveUserTags } from "../lib/api";
import { DEFAULT_USER_TAGS, type UserTag } from "../lib/tags";
import { isDemoMode } from "../lib/supabase";

function demoTags(): UserTag[] {
  return DEFAULT_USER_TAGS.map((tag, index) => ({
    id: `demo-${index}`,
    name: tag.name,
    color: tag.color,
    sort_order: index,
  }));
}

export function useUserTags() {
  const [tags, setTags] = useState<UserTag[]>(isDemoMode ? demoTags() : []);
  const [loading, setLoading] = useState(!isDemoMode);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (isDemoMode) {
      setTags(demoTags());
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const next = await getUserTags();
      setTags(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "טעינת תגיות נכשלה");
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async (nextTags: { name: string; color: string }[]) => {
    if (isDemoMode) {
      setTags(
        nextTags.map((tag, index) => ({
          id: `demo-${index}`,
          name: tag.name,
          color: tag.color,
          sort_order: index,
        })),
      );
      return;
    }

    const saved = await saveUserTags(nextTags);
    setTags(saved);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { tags, loading, error, refresh, save };
}
