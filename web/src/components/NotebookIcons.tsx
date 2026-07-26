import type { SVGProps } from "react";

export type NotebookIconName =
  | "calendar"
  | "star"
  | "book"
  | "lightbulb"
  | "edit"
  | "tag"
  | "bell"
  | "swap"
  | "check"
  | "checkCircle"
  | "circle"
  | "undo"
  | "filter"
  | "search"
  | "sort"
  | "trash"
  | "archive"
  | "whatsapp"
  | "keyboard"
  | "mic"
  | "image"
  | "document"
  | "grip"
  | "plus"
  | "chevronDown"
  | "chevronUp"
  | "list"
  | "leaf";

export type NotebookIconTone =
  | "slate"
  | "blue"
  | "orange"
  | "neutral"
  | "danger"
  | "success"
  | "white"
  | "muted";

const TONE_STROKE: Record<NotebookIconTone, string> = {
  slate: "#64748b",
  blue: "#3b82f6",
  orange: "#f97316",
  neutral: "#94a3b8",
  danger: "#ef4444",
  success: "#22c55e",
  white: "#ffffff",
  muted: "#cbd5e1",
};

type PathDrawer = (stroke: string) => SVGProps<SVGSVGElement>["children"];

const ICON_PATHS: Record<NotebookIconName, PathDrawer> = {
  calendar: (stroke) => (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2" stroke={stroke} strokeWidth="1.5" />
      <path d="M8 2.5v4M16 2.5v4M3 9.5h18" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  star: (stroke) => (
    <path
      d="M12 3.2l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.4l5-.7L12 3.2z"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  book: (stroke) => (
    <>
      <path
        d="M6 4.5h11a2 2 0 012 2v13H8a2 2 0 00-2 2V6.5a2 2 0 012-2z"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 4.5v15" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  lightbulb: (stroke) => (
    <>
      <path
        d="M9.5 18h5M10 21h4M12 3a5.5 5.5 0 013.9 9.4c-.8.8-1.4 1.8-1.4 3.1v.5H9.5v-.5c0-1.3-.6-2.3-1.4-3.1A5.5 5.5 0 0112 3z"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  edit: (stroke) => (
    <path
      d="M4 16.5V20h3.5L18 9.5 14.5 6 4 16.5z"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  ),
  tag: (stroke) => (
    <path
      d="M4 12.5V5.5a1 1 0 011-1h7l8 8-7.5 7.5-8.5-8.5z"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  ),
  bell: (stroke) => (
    <path
      d="M12 4.5a4 4 0 00-4 4v3.5L6.5 14h11l-1.5-2V8.5a4 4 0 00-4-4zM10 17a2 2 0 004 0"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  swap: (stroke) => (
    <>
      <path d="M7 8.5h11M7 8.5l2.5-2.5M7 8.5l2.5 2.5" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 15.5H6M17 15.5l-2.5-2.5M17 15.5l-2.5 2.5" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  check: (stroke) => (
    <path d="M6.5 12.5l3.5 3.5 8-8" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  ),
  checkCircle: (stroke) => (
    <>
      <circle cx="12" cy="12" r="8.5" fill="#3b82f6" stroke="#3b82f6" strokeWidth="1.5" />
      <path d="M8.5 12.2l2.8 2.8 5.2-5.4" stroke="#fff" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  circle: (stroke) => (
    <rect x="5.5" y="5.5" width="13" height="13" rx="3" stroke={stroke} strokeWidth="1.5" />
  ),
  undo: (stroke) => (
    <path
      d="M8 8.5H5.5v-2.5M8 8.5a5.5 5.5 0 107.5 5"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  filter: (stroke) => (
    <path
      d="M4 6h16l-6.5 7.2V18l-3-1.5v-6.3L4 6z"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  ),
  search: (stroke) => (
    <>
      <circle cx="11" cy="11" r="6.5" stroke={stroke} strokeWidth="1.5" />
      <path d="M16 16l4.5 4.5" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  sort: (stroke) => (
    <>
      <path d="M8 6v12M8 18l-2.5-2.5M8 18l2.5-2.5" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 18V6M16 6l2.5 2.5M16 6l-2.5 2.5" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  trash: (stroke) => (
    <>
      <path d="M5 7.5h14M9 7.5V5.5h6v2" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 7.5l.8 11h6.4l.8-11" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
    </>
  ),
  archive: (stroke) => (
    <>
      <rect x="4" y="7" width="16" height="12" rx="1.5" stroke={stroke} strokeWidth="1.5" />
      <path d="M9 7V5.5h6V7M4 11h16" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  whatsapp: (stroke) => (
    <path
      d="M12 4a7.5 7.5 0 00-6.6 11L4 20l5.1-1.3A7.5 7.5 0 1012 4z"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  ),
  keyboard: (stroke) => (
    <>
      <rect x="3" y="7" width="18" height="11" rx="2" stroke={stroke} strokeWidth="1.5" />
      <path d="M7 11h.01M11 11h.01M15 11h.01M7 14h10" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" />
    </>
  ),
  mic: (stroke) => (
    <>
      <rect x="9.5" y="4" width="5" height="9" rx="2.5" stroke={stroke} strokeWidth="1.5" />
      <path d="M7 12a5 5 0 0010 0M12 17v3" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  image: (stroke) => (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" stroke={stroke} strokeWidth="1.5" />
      <circle cx="9" cy="10" r="1.5" stroke={stroke} strokeWidth="1.5" />
      <path d="M6 17l4.5-4.5 3 3L15 12l3 3" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  document: (stroke) => (
    <>
      <path d="M8 4.5h6l4 4v12.5H8V4.5z" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M14 4.5v4.5h4.5" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  grip: (stroke) => (
    <>
      <circle cx="9" cy="8" r="1" fill={stroke} stroke="none" />
      <circle cx="15" cy="8" r="1" fill={stroke} stroke="none" />
      <circle cx="9" cy="12" r="1" fill={stroke} stroke="none" />
      <circle cx="15" cy="12" r="1" fill={stroke} stroke="none" />
      <circle cx="9" cy="16" r="1" fill={stroke} stroke="none" />
      <circle cx="15" cy="16" r="1" fill={stroke} stroke="none" />
    </>
  ),
  plus: (stroke) => (
    <path d="M12 6v12M6 12h12" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" />
  ),
  chevronDown: (stroke) => (
    <path d="M7 10l5 5 5-5" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  ),
  chevronUp: (stroke) => (
    <path d="M7 14l5-5 5 5" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  ),
  list: (stroke) => (
    <>
      <path d="M8 7h12M8 12h12M8 17h12" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="5" cy="7" r="1" fill={stroke} stroke="none" />
      <circle cx="5" cy="12" r="1" fill={stroke} stroke="none" />
      <circle cx="5" cy="17" r="1" fill={stroke} stroke="none" />
    </>
  ),
  leaf: (stroke) => (
    <>
      <path d="M12 19.5V7" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
      <path
        d="M12 11.5c-2.8-1.2-4.5-3.2-4.8-5.5.8-2.2 3.5-3.2 4.8-1.5 1.3-1.7 4-0.7 4.8 1.5-.3 2.3-2 4.3-4.8 5.5z"
        stroke={stroke}
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path
        d="M12 15c-2.2-0.8-3.6-2.4-4-4.2M12 15c2.2-0.8 3.6-2.4 4-4.2"
        stroke={stroke}
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path
        d="M9.5 9.5c-1.4 0.2-2.4 1-2.8 2.2M14.5 9.5c1.4 0.2 2.4 1 2.8 2.2"
        stroke={stroke}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </>
  ),
};

export function sourceKindIcon(kind: string): NotebookIconName {
  switch (kind) {
    case "whatsapp":
      return "whatsapp";
    case "voice":
      return "mic";
    case "image":
      return "image";
    case "document":
      return "document";
    default:
      return "keyboard";
  }
}

import type { BoardAccentTone } from "../lib/board-accent";

export function boardAccentIcon(accent: BoardAccentTone | undefined): NotebookIconName {
  if (accent === "today") return "calendar";
  if (accent === "notes") return "book";
  return "star";
}

interface NotebookIconProps {
  name: NotebookIconName;
  size?: number;
  tone?: NotebookIconTone;
  className?: string;
  /** Filled star for priority markers. */
  filled?: boolean;
}

/** Thin-line notebook icons — shared across cards, toolbars, and swipe actions. */
export function NotebookIcon({
  name,
  size = 16,
  tone = "neutral",
  className = "",
  filled = false,
}: NotebookIconProps) {
  const stroke = TONE_STROKE[tone];
  if (name === "star" && filled) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        className={className}
        aria-hidden
      >
        <path
          d="M12 3.2l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.4l5-.7L12 3.2z"
          fill="#fbbf24"
          stroke="#f59e0b"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === "star") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`shrink-0 ${className}`}
        aria-hidden
      >
        {ICON_PATHS.star(stroke)}
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-hidden
    >
      {ICON_PATHS[name](stroke)}
    </svg>
  );
}
