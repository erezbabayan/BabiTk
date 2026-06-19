import type { ReactNode } from "react";
import { useState } from "react";
import { searchItemsApi, isPaywallError, type NoteSearchHit, type SearchScope } from "../lib/api";
import { ColumnSearch, ColumnSearchAiButton, type ColumnSearchTone } from "./ColumnSearch";
import { ItemCard } from "./ItemCard";
import type { MindtaskerItem } from "../types";

function toItem(hit: NoteSearchHit): MindtaskerItem {
  return {
    id: hit.id,
    user_id: "",
    source_material_id: null,
    title: hit.title,
    content: hit.content,
    is_actionable: hit.is_actionable ?? false,
    status: (hit.status as MindtaskerItem["status"]) ?? "pending",
    due_date: null,
    completed_at: null,
    tags: hit.tags,
    sort_order: 0,
    last_interacted_at: "",
    created_at: "",
    updated_at: "",
  };
}

interface ColumnSemanticSearchProps {
  scope: SearchScope;
  input: string;
  onInputChange: (value: string) => void;
  activeQuery: string;
  onSearch: () => void;
  onClear: () => void;
  placeholder: string;
  tone: ColumnSearchTone;
  children?: (searchBar: ReactNode, aiButton: ReactNode, footer: ReactNode) => ReactNode;
}

export function ColumnSemanticSearch({
  scope,
  input,
  onInputChange,
  activeQuery,
  onSearch,
  onClear,
  placeholder,
  tone,
  children,
}: ColumnSemanticSearchProps) {
  const [results, setResults] = useState<NoteSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSemanticSearch() {
    const q = input.trim();
    if (q.length < 2) return;

    setLoading(true);
    setError(null);
    try {
      const hits = await searchItemsApi(q, scope);
      setResults(hits);
    } catch (err) {
      if (!isPaywallError(err)) {
        setError(err instanceof Error ? err.message : "חיפוש נכשל");
      }
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setResults([]);
    setError(null);
    onClear();
  }

  const searchBar = (
    <ColumnSearch
      inline
      value={input}
      onChange={(value) => {
        onInputChange(value);
        if (!value.trim()) {
          setResults([]);
          setError(null);
        }
      }}
      activeQuery={activeQuery}
      onSearch={onSearch}
      onClear={handleClear}
      placeholder={placeholder}
      tone={tone}
    />
  );

  const aiButton = (
    <ColumnSearchAiButton
      label="AI"
      onClick={() => void runSemanticSearch()}
      loading={loading}
      disabled={input.trim().length < 2}
    />
  );

  const footer = (
    <>
      {error ? <p className="mt-1 text-[11px] text-red-600">{error}</p> : null}
      {results.length > 0 ? (
        <div className="mt-1 space-y-1 rounded-md border border-slate-200 bg-white/70 p-1.5">
          <p className="text-[11px] font-medium text-slate-700">תוצאות חיפוש סמנטי</p>
          {results.map((hit) => (
            <div key={hit.id}>
              <p className="mb-0.5 text-[10px] text-slate-500">
                דמיון: {(hit.similarity * 100).toFixed(0)}%
              </p>
              <ItemCard item={toItem(hit)} compact />
            </div>
          ))}
        </div>
      ) : null}
    </>
  );

  if (children) {
    return <>{children(searchBar, aiButton, footer)}</>;
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">{searchBar}</div>
        {aiButton}
      </div>
      {footer}
    </div>
  );
}

/** @deprecated Use ColumnSemanticSearch */
export const NotesSemanticSearch = ColumnSemanticSearch;
