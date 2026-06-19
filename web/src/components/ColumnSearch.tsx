import type { FormEvent } from "react";

/** Logo order: orange → blue → slate */
export type ColumnSearchTone = "orange" | "blue" | "slate";

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
  "!absolute !left-0 !top-0 !bottom-0 !min-w-[2.25rem] !rounded-none !border-0 !border-r !border-black/15 !px-2 !py-0 !text-[10px] !leading-none";

const SEARCH_FRAME = "overflow-hidden rounded-md border border-black";

interface ExtraSearchButton {
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}

interface ColumnSearchProps {
  value: string;
  onChange: (value: string) => void;
  activeQuery: string;
  onSearch: () => void;
  onClear: () => void;
  placeholder: string;
  tone: ColumnSearchTone;
  loading?: boolean;
  extraButton?: ExtraSearchButton;
  inline?: boolean;
}

export function ColumnSearchAiButton({
  label,
  onClick,
  loading = false,
  disabled = false,
}: ExtraSearchButton) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className="shrink-0 border border-black bg-white !px-1.5 !py-1 !text-[10px] !leading-none hover:bg-slate-50 disabled:opacity-50"
    >
      {loading ? "..." : label}
    </button>
  );
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
  extraButton,
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
      <form onSubmit={handleSubmit} className={`relative mb-0 w-full min-w-0 ${SEARCH_FRAME}`}>
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full !rounded-none !border-0 !bg-white !py-1 !pr-2 !pl-9 !text-[10px] !leading-tight shadow-none"
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
    <form onSubmit={handleSubmit} className={`mb-2 flex items-stretch ${SEARCH_FRAME}`}>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 !rounded-none !border-0 !bg-white py-0.5 !pr-2 !pl-2 shadow-none"
        dir="rtl"
      />
      <button
        type="submit"
        disabled={loading}
        className={`shrink-0 !rounded-none border-l border-black/15 disabled:opacity-50 ${submitClass}`}
      >
        {loading ? "..." : isActive ? "חזור" : "חפש"}
      </button>
      {extraButton ? (
        <ColumnSearchAiButton {...extraButton} />
      ) : null}
    </form>
  );
}

export type { ExtraSearchButton };
