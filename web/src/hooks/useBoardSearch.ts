import { useCallback, useState } from "react";
import { searchItemsApi, type NoteSearchHit, type SearchScope } from "../lib/api";
import { isIgnorableBoardSearchError } from "../lib/board-search";

const EMPTY_HITS: NoteSearchHit[] = [];

/**
 * Board column search filters items already loaded in memory
 * (mergeSearchResults / filterItemsByQuery), and also asks the backend
 * for semantic hits when /api/items/search is available.
 */
export function useBoardSearch(scope: SearchScope) {
  const [input, setInputState] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [semanticHits, setSemanticHits] = useState<NoteSearchHit[]>(EMPTY_HITS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clear = useCallback(() => {
    setInputState("");
    setActiveQuery("");
    setSemanticHits(EMPTY_HITS);
    setError(null);
  }, []);

  const setInput = useCallback((value: string) => {
    setInputState(value);
    if (!value.trim()) {
      setActiveQuery("");
      setSemanticHits(EMPTY_HITS);
      setError(null);
    }
  }, []);

  const search = useCallback(() => {
    const query = input.trim();
    setActiveQuery(query);
    if (query.length < 2) {
      setSemanticHits(EMPTY_HITS);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    void searchItemsApi(query, scope)
      .then((hits) => {
        setSemanticHits(hits);
      })
      .catch((err) => {
        setSemanticHits(EMPTY_HITS);
        if (!isIgnorableBoardSearchError(err)) {
          setError(err instanceof Error ? err.message : "חיפוש נכשל");
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [input, scope]);

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
