import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

export const ITEM_DRAG_HANDLE_ATTR = "data-item-drag-handle";

export interface SwipeAction {
  label: string;
  icon: string;
  onTrigger: () => void;
  tone?: "primary" | "success" | "danger" | "neutral";
}

interface SwipeableItemCardProps {
  children: ReactNode;
  leftAction?: SwipeAction;
  rightAction?: SwipeAction;
  disabled?: boolean;
}

const REVEAL = 80;
const THRESHOLD = 52;
const LOCK_PX = 6;

const TONE_CLASS: Record<NonNullable<SwipeAction["tone"]>, string> = {
  primary: "bg-blue-500 text-white",
  success: "bg-emerald-500 text-white",
  danger: "bg-red-500 text-white",
  neutral: "bg-slate-500 text-white",
};

export function SwipeableItemCard({
  children,
  leftAction,
  rightAction,
  disabled = false,
}: SwipeableItemCardProps) {
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [swiping, setSwiping] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, locked: null as boolean | null, x: 0, y: 0 });
  const allowColumnDragRef = useRef(false);
  const offsetRef = useRef(0);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    function onDragStart(e: DragEvent) {
      if (allowColumnDragRef.current) return;
      e.preventDefault();
      e.stopPropagation();
    }

    function onDragEnd() {
      allowColumnDragRef.current = false;
    }

    root.addEventListener("dragstart", onDragStart, true);
    root.addEventListener("dragend", onDragEnd, true);
    return () => {
      root.removeEventListener("dragstart", onDragStart, true);
      root.removeEventListener("dragend", onDragEnd, true);
    };
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

  function shouldIgnoreTarget(target: HTMLElement) {
    return Boolean(target.closest("button, input, textarea, label, select, a, audio"));
  }

  function enableColumnDrag() {
    allowColumnDragRef.current = true;
    const article = containerRef.current?.querySelector<HTMLElement>("[data-item-drag-root]");
    if (article) {
      article.draggable = true;
    }
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (disabled || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (shouldIgnoreTarget(target)) return;

    if (target.closest(`[${ITEM_DRAG_HANDLE_ATTR}]`)) {
      enableColumnDrag();
      return;
    }

    drag.current = { active: true, locked: null, x: e.clientX, y: e.clientY };
    allowColumnDragRef.current = false;
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return;

    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;

    if (drag.current.locked === null) {
      if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
      const horizontal = Math.abs(dx) > Math.abs(dy);
      drag.current.locked = horizontal;
      if (horizontal) {
        setSwiping(true);
        containerRef.current?.setPointerCapture(e.pointerId);
      } else {
        enableColumnDrag();
        drag.current.active = false;
        return;
      }
    }
    if (!drag.current.locked) return;

    e.preventDefault();

    let next = dx;
    if (!rightAction) next = Math.min(0, next);
    if (!leftAction) next = Math.max(0, next);
    next = Math.max(-REVEAL, Math.min(REVEAL, next));
    setOffset(next);
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current.active) {
      allowColumnDragRef.current = false;
      return;
    }

    const current = offsetRef.current;
    endGesture();
    if (containerRef.current?.hasPointerCapture(e.pointerId)) {
      containerRef.current.releasePointerCapture(e.pointerId);
    }

    if (current >= THRESHOLD && rightAction) {
      rightAction.onTrigger();
    } else if (current <= -THRESHOLD && leftAction) {
      leftAction.onTrigger();
    }
    resetOffset();
    allowColumnDragRef.current = false;
  }

  function onPointerCancel(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current.active) {
      allowColumnDragRef.current = false;
      return;
    }
    endGesture();
    if (containerRef.current?.hasPointerCapture(e.pointerId)) {
      containerRef.current.releasePointerCapture(e.pointerId);
    }
    resetOffset();
    allowColumnDragRef.current = false;
  }

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-md"
      style={{ touchAction: swiping ? "none" : "pan-y" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {leftAction ? (
        <div
          className={`absolute inset-y-0 left-0 flex w-20 items-center justify-center px-1 text-center transition-opacity duration-100 ${TONE_CLASS[leftAction.tone ?? "primary"]} ${revealing && offset < 0 ? "opacity-100" : "opacity-0"}`}
          aria-hidden={!revealing || offset >= 0}
        >
          <span className="text-[11px] font-semibold leading-tight">{leftAction.label}</span>
        </div>
      ) : null}
      {rightAction ? (
        <div
          className={`absolute inset-y-0 right-0 flex w-20 items-center justify-center px-1 text-center transition-opacity duration-100 ${TONE_CLASS[rightAction.tone ?? "danger"]} ${revealing && offset > 0 ? "opacity-100" : "opacity-0"}`}
          aria-hidden={!revealing || offset <= 0}
        >
          <span className="text-[11px] font-semibold leading-tight">{rightAction.label}</span>
        </div>
      ) : null}

      <div
        className={`relative z-10 select-none ${animating ? "transition-transform duration-200 ease-out" : ""}`}
        style={{ transform: `translateX(${offset}px)` }}
      >
        {children}
      </div>
    </div>
  );
}
