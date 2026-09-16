import { useCallback, useState } from "react";
import type { NoteSearchHit, SearchScope } from "../lib/api";

const EMPTY_HITS: NoteSearchHit[] = [];

/**
 * Board column search filters items already loaded in memory
 * (mergeSearchResults / filterItemsByQuery). Never calls /api/items/search —
 * GitHub Pages returns 405 for that POST and used to show a red "API error 405".
 */
export function useBoardSearch(_scope: SearchScope) {
  const [input, setInputState] = useState("");
  const [activeQuery, setActiveQuery] = useState("");

  const clear = useCallback(() => {
    setInputState("");
    setActiveQuery("");
  }, []);

  const setInput = useCallback((value: string) => {
    setInputState(value);
    if (!value.trim()) {
      setActiveQuery("");
    }
  }, []);

  const search = useCallback(() => {
    setActiveQuery(input.trim());
  }, [input]);

  return {
    input,
    setInput,
    activeQuery,
    semanticHits: EMPTY_HITS,
    loading: false,
    error: null as string | null,
    search,
    clear,
  };
}
