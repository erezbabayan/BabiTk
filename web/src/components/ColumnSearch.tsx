import type { FormEvent } from "react";
import { NotebookIcon, type NotebookIconTone } from "./NotebookIcons";

/** Logo order: orange → blue → slate */
export type ColumnSearchTone = "orange" | "blue" | "slate";

function searchIconTone(tone: ColumnSearchTone): NotebookIconTone {
  if (tone === "slate") return "neutral";
  return tone;
}

const BUTTON_TONE: Record<ColumnSearchTone, string> = {
  orange: "bg-orange-500 text-white hover:bg-orange-600",
  blue: "bg-blue-500 text-white hover:bg-blue-600",
  slate: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
};

const BACK_BUTTON_TONE: Record<ColumnSearchTone, string> = {
  orange: "border border-orange-300 bg-white text-orange-700 hover:bg-orange-50",
  blue: "border border-blue-300 bg-white text-blue-700 hover:bg-blue-50",
  slate: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
};

const EMBEDDED_BTN =
  "!absolute !left-0 !top-0 !bottom-0 !min-w-[1.75rem] !rounded-none !border-0 !border-r !border-stone-200/80 !px-1 !py-0 !text-[9px] !leading-none";

const SEARCH_FRAME = (tone: ColumnSearchTone) =>
  `column-search-frame column-search-frame--${tone} overflow-hidden`;

interface ColumnSearchProps {
  value: string;
  onChange: (value: string) => void;
  activeQuery: string;
  onSearch: () => void;
  onClear: () => void;
  placeholder: string;
  tone: ColumnSearchTone;
  loading?: boolean;
  inline?: boolean;
}

export function ColumnSearch({
  value,
  onChange,
  activeQuery,
  onSearch,
  onClear,
  placeholder,
  tone,
  loading = false,
  inline = false,
}: ColumnSearchProps) {
  const isActive = activeQuery.trim().length > 0;
  const submitClass = isActive ? BACK_BUTTON_TONE[tone] : BUTTON_TONE[tone];

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isActive) {
      onChange("");
      onClear();
    } else {
      onSearch();
    }
  }

  if (inline) {
    return (
      <form onSubmit={handleSubmit} className={`relative mb-0 h-6 w-full min-w-0 ${SEARCH_FRAME(tone)}`}>
        <span className="column-search-deco" aria-hidden>
          <NotebookIcon name="leaf" size={9} tone={searchIconTone(tone)} />
        </span>
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full !rounded-none !border-0 !bg-transparent !py-0.5 !pr-7 !pl-7 !text-[9px] !leading-tight shadow-none"
          dir="rtl"
        />
        <button
          type="submit"
          disabled={loading}
          className={`${EMBEDDED_BTN} disabled:opacity-50 ${submitClass}`}
        >
          {loading ? "..." : isActive ? "חזור" : "חפש"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`relative mb-2 flex items-stretch ${SEARCH_FRAME(tone)}`}>
      <span className="column-search-deco" aria-hidden>
        <NotebookIcon name="leaf" size={10} tone={searchIconTone(tone)} />
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 !rounded-none !border-0 !bg-transparent py-0.5 !pr-7 !pl-2 shadow-none"
        dir="rtl"
      />
      <button
        type="submit"
        disabled={loading}
        className={`shrink-0 !rounded-none border-l border-stone-200/80 disabled:opacity-50 ${submitClass}`}
      >
        {loading ? "..." : isActive ? "חזור" : "חפש"}
      </button>
    </form>
  );
}
