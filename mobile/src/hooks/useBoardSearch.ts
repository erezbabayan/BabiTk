import { useCallback, useState } from "react";
import { isPaywallError, searchItems } from "../lib/api";
import {
  isIgnorableBoardSearchError,
  isLegacyExpressApiAvailable,
  shouldRunRemoteBoardSearch,
} from "../lib/board-search";
import { useConvexBackend } from "../lib/data-backend";

type SearchScope = "inbox" | "today" | "notes";

export interface BoardSemanticHit {
  id: string;
  title: string;
  content: string;
  tags: string[];
  similarity: number;
}

/**
 * Board column search. Filtering is client-side via activeQuery.
 * Remote Express search only when EXPO_PUBLIC_API_URL is set.
 */
export function useBoardSearch(scope: SearchScope) {
  const convexBackend = useConvexBackend();
  const [input, setInputState] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [semanticHits, setSemanticHits] = useState<BoardSemanticHit[]>([]);
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

    if (
      !shouldRunRemoteBoardSearch(
        convexBackend,
        isLegacyExpressApiAvailable(process.env.EXPO_PUBLIC_API_URL),
      )
    ) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const hits = await searchItems(q, scope);
      setSemanticHits(hits);
    } catch (err) {
      if (!isPaywallError(err) && !isIgnorableBoardSearchError(err)) {
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
