import { useCallback, useState } from "react";
import { isPaywallError, searchItemsApi, type NoteSearchHit, type SearchScope } from "../lib/api";
import { useConvexBackend } from "../lib/data-backend";

/**
 * Board column search. With Convex, filtering is client-side via activeQuery
 * (mergeSearchResults / filterItemsByQuery). Remote semantic search only runs
 * when the legacy Express+Supabase API is available.
 */
export function useBoardSearch(scope: SearchScope) {
  const convexBackend = useConvexBackend();
  const [input, setInputState] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [semanticHits, setSemanticHits] = useState<NoteSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clear = useCallback(() => {
    setInputState("");
    setActiveQuery("");
    setSemanticHits([]);
    setError(null);
    setLoading(false);
  }, []);

  const setInput = useCallback((value: string) => {
    setInputState(value);
    if (!value.trim()) {
      setSemanticHits([]);
      setError(null);
      setActiveQuery("");
    }
  }, []);

  const search = useCallback(async () => {
    const q = input.trim();
    setActiveQuery(q);
    setSemanticHits([]);
    setError(null);

    if (q.length < 2) {
      setLoading(false);
      return;
    }

    // Convex boards already hold items in memory — filter locally, no Supabase token.
    if (convexBackend) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const hits = await searchItemsApi(q, scope);
      setSemanticHits(hits);
    } catch (err) {
      if (!isPaywallError(err)) {
        setError(err instanceof Error ? err.message : "חיפוש נכשל");
      }
      setSemanticHits([]);
    } finally {
      setLoading(false);
    }
  }, [input, scope, convexBackend]);

  return {
    input,
    setInput,
    activeQuery,
    semanticHits,
    loading,
    error,
    search,
    clear,
  };
}
