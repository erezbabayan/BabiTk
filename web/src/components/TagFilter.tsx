import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NotebookIcon } from "./NotebookIcons";
import { TagChip } from "./TagChip";
import { colorForTag, type UserTag } from "../lib/tags";
import { tagFilterAriaLabel, tagFilterTriggerLabel } from "../lib/tag-filter";

interface TagFilterProps {
  tags: string[];
  selected: string | null;
  onSelect: (tag: string | null) => void;
  userTags?: UserTag[];
}

interface PanelPosition {
  top: number;
  left: number;
  width: number;
}

function TagFilterPanel({
  tags,
  selected,
  onSelect,
  userTags,
  panelRef,
  style,
}: {
  tags: string[];
  selected: string | null;
  onSelect: (tag: string | null) => void;
  userTags: UserTag[];
  panelRef: React.RefObject<HTMLDivElement | null>;
  style: PanelPosition;
}) {
  return (
    <div
      ref={panelRef}
      data-no-drag-scroll
      className="fixed z-[120] flex max-h-[min(40vh,240px)] flex-wrap gap-1.5 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 shadow-lg"
      style={{ top: style.top, left: style.left, width: style.width }}
      onWheel={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`rounded-full px-2 py-0.5 text-xs ${
          selected === null
            ? "bg-slate-700 text-white"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
      >
        הכל
      </button>
      {tags.map((tag) => (
        <TagChip
          key={tag}
          name={tag}
          color={colorForTag(tag, userTags)}
          size="sm"
          selected={selected === tag}
          onClick={() => onSelect(selected === tag ? null : tag)}
        />
      ))}
    </div>
  );
}

export function TagFilter({ tags, selected, onSelect, userTags = [] }: TagFilterProps) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<PanelPosition | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPanelStyle(null);
      return;
    }

    function updatePosition() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 240), Math.max(160, window.innerWidth - 16));
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      setPanelStyle({
        top: rect.bottom + 4,
        left,
        width,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  if (tags.length === 0) {
    return <div className="h-8 shrink-0" aria-hidden data-no-drag-scroll />;
  }

  return (
    <div
      className="relative z-[1] h-8 min-w-0"
      data-no-drag-scroll
      onWheel={(e) => e.stopPropagation()}
    >
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex h-8 w-full min-w-0 items-center justify-between gap-1 overflow-hidden rounded-lg border px-2 text-xs shadow-sm transition hover:bg-white ${
          selected
            ? "border-orange-300/90 bg-orange-50 text-orange-900"
            : "border-slate-200/80 bg-white/80 text-slate-600"
        }`}
        aria-expanded={open}
        aria-label={tagFilterAriaLabel(selected)}
        title={tagFilterAriaLabel(selected)}
      >
        <span className="flex min-w-0 items-center gap-1.5 overflow-hidden font-medium">
          <span className="shrink-0">
            <NotebookIcon name="filter" size={14} tone="orange" />
          </span>
          <span className="min-w-0 truncate whitespace-nowrap">
            {tagFilterTriggerLabel(selected)}
          </span>
        </span>
        <span className="shrink-0 text-slate-400" aria-hidden>
          <NotebookIcon name={open ? "chevronUp" : "chevronDown"} size={14} tone="muted" />
        </span>
      </button>

      {open && panelStyle
        ? createPortal(
            <TagFilterPanel
              tags={tags}
              selected={selected}
              onSelect={(tag) => {
                onSelect(tag);
                setOpen(false);
              }}
              userTags={userTags}
              panelRef={panelRef}
              style={panelStyle}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
