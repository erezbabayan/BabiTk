import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

export const ITEM_DRAG_HANDLE_ATTR = "data-item-drag-handle";
export const ITEM_ACTION_ATTR = "data-item-action";

import { NotebookIcon, type NotebookIconName } from "./NotebookIcons";

export interface SwipeAction {
  label: string;
  icon: NotebookIconName;
  onTrigger: () => void;
  tone?: "primary" | "tasks" | "notes" | "danger" | "neutral";
}

interface SwipeableItemCardProps {
  children: ReactNode;
  leftAction?: SwipeAction;
  rightAction?: SwipeAction;
  disabled?: boolean;
  /** Narrower swipe reveal — matches dense list rows. */
  compact?: boolean;
  /** Even tighter reveal for 2-column squares cards. */
  squares?: boolean;
}

const REVEAL = 80;
const THRESHOLD = 52;
const REVEAL_COMPACT = 56;
const THRESHOLD_COMPACT = 34;
const REVEAL_SQUARES = 48;
const THRESHOLD_SQUARES = 28;
const LOCK_PX = 8;

const TONE_CLASS: Record<NonNullable<SwipeAction["tone"]>, string> = {
  primary: "bg-blue-500 text-white",
  tasks: "bg-[#3B82F6] text-white",
  notes: "bg-[#F97316] text-white",
  danger: "bg-red-500 text-white",
  neutral: "bg-slate-500 text-white",
};

export function SwipeableItemCard({
  children,
  leftAction,
  rightAction,
  disabled = false,
  compact = false,
  squares = false,
}: SwipeableItemCardProps) {
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [swiping, setSwiping] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, locked: null as boolean | null, x: 0, y: 0 });
  const offsetRef = useRef(0);
  const reveal = squares ? REVEAL_SQUARES : compact ? REVEAL_COMPACT : REVEAL;
  const threshold = squares ? THRESHOLD_SQUARES : compact ? THRESHOLD_COMPACT : THRESHOLD;
  const actionWidthClass = squares ? "w-12 gap-0 px-0.5" : compact ? "w-14 gap-0 px-0.5" : "w-20 gap-0.5 px-1";
  const actionLabelClass = squares
    ? "text-[8px] leading-none"
    : compact
      ? "text-[9px]"
      : "text-[11px] leading-tight";
  const actionIconSize = squares ? 14 : compact ? 15 : 20;

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    function onDragStart(e: DragEvent) {
      const target = e.target as HTMLElement;
      if (target.closest(`[${ITEM_DRAG_HANDLE_ATTR}]`)) return;
      e.preventDefault();
      e.stopPropagation();
    }

    root.addEventListener("dragstart", onDragStart, true);
    return () => root.removeEventListener("dragstart", onDragStart, true);
  }, []);

  if (!leftAction && !rightAction) {
    return <>{children}</>;
  }

  const revealing = Math.abs(offset) > 4;

  function resetOffset() {
    setAnimating(true);
    setOffset(0);
    window.setTimeout(() => setAnimating(false), 180);
  }

  function endGesture() {
    drag.current.active = false;
    drag.current.locked = null;
    setSwiping(false);
  }

  function shouldIgnoreTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) return false;
    return Boolean(
      target.closest(
        `button, input, textarea, label, select, a, audio, [role="button"], [${ITEM_DRAG_HANDLE_ATTR}], [${ITEM_ACTION_ATTR}]`,
      ),
    );
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (disabled || e.button !== 0) return;
    if (shouldIgnoreTarget(e.target)) {
      endGesture();
      return;
    }

    drag.current = { active: true, locked: null, x: e.clientX, y: e.clientY };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return;

    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;

    if (drag.current.locked === null) {
      if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
      const horizontal = Math.abs(dx) > Math.abs(dy);
      drag.current.locked = horizontal;
      if (!horizontal) {
        drag.current.active = false;
        return;
      }
      setSwiping(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (!drag.current.locked) return;

    e.preventDefault();

    let next = dx;
    if (!rightAction) next = Math.min(0, next);
    if (!leftAction) next = Math.max(0, next);
    next = Math.max(-reveal, Math.min(reveal, next));
    setOffset(next);
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (shouldIgnoreTarget(e.target)) {
      endGesture();
      return;
    }

    if (!drag.current.active && drag.current.locked === null) return;

    const wasSwiping = drag.current.locked === true;
    const current = offsetRef.current;
    endGesture();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    if (!wasSwiping) return;

    if (current >= threshold && rightAction) {
      rightAction.onTrigger();
    } else if (current <= -threshold && leftAction) {
      leftAction.onTrigger();
    }
    resetOffset();
  }

  function onPointerCancel(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current.active && drag.current.locked === null) return;
    endGesture();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    resetOffset();
  }

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${
        squares ? "h-full min-h-0 rounded-none shadow-none" : compact ? "rounded" : "rounded-xl"
      }`}
      style={
        squares
          ? {
              flex: "1 1 auto",
              width: "100%",
              margin: 0,
              borderRadius: 10,
              boxShadow: "none",
              backgroundColor: "#ffffff",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              overflow: "hidden",
            }
          : undefined
      }
    >
      {rightAction ? (
        <div
          className={`absolute inset-y-0 left-0 z-0 flex ${actionWidthClass} flex-col items-center justify-center text-center ${TONE_CLASS[rightAction.tone ?? "danger"]} ${
            revealing && offset > 0 ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          aria-hidden={!revealing || offset <= 0}
        >
          <span className="flex items-center justify-center leading-none" aria-hidden>
            <NotebookIcon name={rightAction.icon} size={actionIconSize} tone="white" />
          </span>
          <span className={`font-semibold leading-none ${actionLabelClass}`}>
            {rightAction.label}
          </span>
        </div>
      ) : null}
      {leftAction ? (
        <div
          className={`absolute inset-y-0 right-0 z-0 flex ${actionWidthClass} flex-col items-center justify-center text-center ${TONE_CLASS[leftAction.tone ?? "primary"]} ${
            revealing && offset < 0 ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          aria-hidden={!revealing || offset >= 0}
        >
          <span className="flex items-center justify-center leading-none" aria-hidden>
            <NotebookIcon name={leftAction.icon} size={actionIconSize} tone="white" />
          </span>
          <span className={`font-semibold leading-none ${actionLabelClass}`}>
            {leftAction.label}
          </span>
        </div>
      ) : null}

      <div
        className={`relative z-10 select-none [&_button]:relative [&_button]:z-20 ${
          squares ? "flex min-h-0 w-full flex-1 flex-col" : ""
        } ${animating ? "transition-transform duration-200 ease-out" : ""}`}
        style={{
          transform: `translateX(${offset}px)`,
          touchAction: swiping ? "none" : "pan-y",
          ...(squares ? { flex: "1 1 auto", minHeight: 0, overflow: "hidden" } : null),
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {children}
      </div>
    </div>
  );
}
