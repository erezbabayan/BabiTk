import { useCallback, useState } from "react";

type SearchScope = "inbox" | "today" | "notes";

export interface BoardSemanticHit {
  id: string;
  title: string;
  content: string;
  tags: string[];
  similarity: number;
}

const EMPTY_HITS: BoardSemanticHit[] = [];

/**
 * Board column search. Filtering is client-side via activeQuery.
 * Never calls the retired Express search API (that 405s on static hosting).
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
