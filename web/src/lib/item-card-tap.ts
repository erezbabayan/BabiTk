/**
 * Tap-on-card opens the item editor (the ✏️ button was removed).
 * Inner controls (done checkbox, star, tag, reminder, flip, checklist, expand,
 * drag handle, links, source chip) keep their own behaviour and never open the editor.
 */
export const ITEM_CARD_INTERACTIVE_SELECTOR = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "label",
  "audio",
  "video",
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="checkbox"]',
  "[data-item-drag-handle]",
  "[data-item-action]",
  "[data-item-no-edit]",
].join(", ");

export type CardTapAction = "toggle-select" | "edit" | "none";

export function resolveCardTapAction(input: {
  selecting: boolean;
  canSelect: boolean;
  canEdit: boolean;
  showSource: boolean;
  interactiveTarget: boolean;
  hasTextSelection: boolean;
}): CardTapAction {
  if (input.interactiveTarget) return "none";
  if (input.selecting) return input.canSelect ? "toggle-select" : "none";
  if (!input.canEdit || input.showSource) return "none";
  // Desktop users dragging to select text must not get the editor popping up.
  if (input.hasTextSelection) return "none";
  return "edit";
}

export function isInteractiveCardTarget(target: EventTarget | null): boolean {
  // SVG icons inside buttons are Element but not HTMLElement — still interactive.
  if (!target || typeof (target as Element).closest !== "function") return false;
  return Boolean((target as Element).closest(ITEM_CARD_INTERACTIVE_SELECTOR));
}
