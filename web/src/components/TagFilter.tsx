import { useState } from "react";
import { colorForTag, readableTextColor, type UserTag } from "../lib/tags";

interface TagFilterProps {
  tags: string[];
  selected: string | null;
  onSelect: (tag: string | null) => void;
  userTags?: UserTag[];
}

export function TagFilter({ tags, selected, onSelect, userTags = [] }: TagFilterProps) {
  const [open, setOpen] = useState(false);

  if (tags.length === 0) return null;

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white/70 px-2 py-1 text-xs text-slate-600 hover:bg-white"
        aria-expanded={open}
      >
        <span className="font-medium">
          🏷️ סינון תגיות
          {selected ? (
            <span className="font-normal text-slate-500"> · #{selected}</span>
          ) : null}
        </span>
        <span className="text-slate-400" aria-hidden>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5 rounded-md border border-slate-100 bg-slate-50/80 p-1.5">
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={`rounded-full px-2 py-0.5 ${
              selected === null
                ? "bg-slate-700 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            הכל
          </button>
          {tags.map((tag) => {
            const color = colorForTag(tag, userTags, "#ea580c");
            const active = selected === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => onSelect(tag)}
                className="rounded-full px-2 py-0.5 transition-opacity hover:opacity-90"
                style={
                  active
                    ? { backgroundColor: color, color: readableTextColor(color) }
                    : {
                        backgroundColor: `${color}22`,
                        color,
                        border: `1px solid ${color}55`,
                      }
                }
              >
                #{tag}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
