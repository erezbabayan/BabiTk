import { useEffect, useRef, type ReactNode } from "react";
import { BOARD_ITEMS_INNER_CLASS, BOARD_SCROLL_SCROLLBAR_EDGE_CLASS } from "../lib/board-item-layout";
import { ITEM_ACTION_ATTR, ITEM_DRAG_HANDLE_ATTR } from "./SwipeableItemCard";

const INTERACTIVE_SELECTOR = `button, a, input, textarea, select, label, [contenteditable="true"], [role="button"], [data-no-drag-scroll], [${ITEM_DRAG_HANDLE_ATTR}], [${ITEM_ACTION_ATTR}]`;

const DRAG_THRESHOLD_PX = 6;

function isInteractiveTarget(target: EventTarget | null): boolean {
  // SVG icons inside buttons are Element but not HTMLElement — still interactive.
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(INTERACTIVE_SELECTOR));
}

function useMouseDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const dragState = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    startScrollTop: 0,
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary || isInteractiveTarget(event.target)) {
        return;
      }

      dragState.current = {
        active: false,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startScrollTop: element.scrollTop,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      const state = dragState.current;
      if (state.pointerId !== event.pointerId) return;

      const deltaX = event.clientX - state.startX;
      const deltaY = event.clientY - state.startY;

      if (!state.active) {
        if (Math.abs(deltaX) < DRAG_THRESHOLD_PX && Math.abs(deltaY) < DRAG_THRESHOLD_PX) {
          return;
        }
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          state.pointerId = -1;
          return;
        }
        state.active = true;
        element.classList.add("cursor-grabbing");
        element.classList.remove("cursor-grab");
        element.setPointerCapture(event.pointerId);
      }

      event.preventDefault();
      const nextScrollTop = state.startScrollTop - deltaY;
      window.requestAnimationFrame(() => {
        if (dragState.current.pointerId === event.pointerId) {
          element.scrollTop = nextScrollTop;
        }
      });
    };

    const endDrag = (event: PointerEvent) => {
      const state = dragState.current;
      if (state.pointerId !== event.pointerId) return;

      state.active = false;
      state.pointerId = -1;
      element.classList.remove("cursor-grabbing");
      element.classList.add("cursor-grab");
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }
    };

    element.classList.add("cursor-grab");
    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", endDrag);
    element.addEventListener("pointercancel", endDrag);

    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", endDrag);
      element.removeEventListener("pointercancel", endDrag);
      element.classList.remove("cursor-grab", "cursor-grabbing");
    };
  }, []);

  return ref;
}

export const BOARD_SCROLL_CLASS =
  "min-h-0 flex-1 overflow-y-auto overscroll-y-contain touch-pan-y [scrollbar-gutter:stable]";

export function scrollAllBoardColumnsToTop(smooth = true): void {
  for (const element of document.querySelectorAll("[data-board-scroll]")) {
    if (element instanceof HTMLElement) {
      element.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
    }
  }
}

export const BOARD_SECTION_CLASS = "flex h-full min-h-0 flex-col overflow-hidden";

interface MouseDragScrollProps {
  children: ReactNode;
  className?: string;
}

/** Vertical scroll by click-and-drag — one instance per board column. */
export function MouseDragScroll({ children, className = "" }: MouseDragScrollProps) {
  const ref = useMouseDragScroll<HTMLDivElement>();

  return (
    <div
      ref={ref}
      data-board-scroll
      className={`${BOARD_SCROLL_CLASS} ${BOARD_SCROLL_SCROLLBAR_EDGE_CLASS} ${className}`.trim()}
    >
      <div className={BOARD_ITEMS_INNER_CLASS}>{children}</div>
    </div>
  );
}
