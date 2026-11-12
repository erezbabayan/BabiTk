import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ITEM_CARD_INTERACTIVE_SELECTOR,
  isInteractiveCardTarget,
  resolveCardTapAction,
} from "./item-card-tap.ts";

const base = {
  selecting: false,
  canSelect: true,
  canEdit: true,
  showSource: false,
  interactiveTarget: false,
  hasTextSelection: false,
};

describe("tap on item card", () => {
  it("opens the editor on a plain tap", () => {
    assert.equal(resolveCardTapAction(base), "edit");
  });

  it("never opens the editor from inner controls (checkbox, star, tag, reminder, links…)", () => {
    assert.equal(resolveCardTapAction({ ...base, interactiveTarget: true }), "none");
    assert.equal(
      resolveCardTapAction({ ...base, selecting: true, interactiveTarget: true }),
      "none",
    );
  });

  it("toggles selection instead of editing in selection mode", () => {
    assert.equal(resolveCardTapAction({ ...base, selecting: true }), "toggle-select");
    assert.equal(resolveCardTapAction({ ...base, selecting: true, canSelect: false }), "none");
  });

  it("does nothing when editing is unavailable, source view is open, or text is selected", () => {
    assert.equal(resolveCardTapAction({ ...base, canEdit: false }), "none");
    assert.equal(resolveCardTapAction({ ...base, showSource: true }), "none");
    assert.equal(resolveCardTapAction({ ...base, hasTextSelection: true }), "none");
  });

  it("covers drag handle and action markers in the interactive selector", () => {
    for (const token of ["button", "a", "input", "[data-item-drag-handle]", "[data-item-action]"]) {
      assert.ok(ITEM_CARD_INTERACTIVE_SELECTOR.includes(token), token);
    }
  });

  it("uses Element.closest for interactive detection", () => {
    const hit = { closest: (sel: string) => (sel === ITEM_CARD_INTERACTIVE_SELECTOR ? {} : null) };
    const miss = { closest: () => null };
    assert.equal(isInteractiveCardTarget(hit as unknown as EventTarget), true);
    assert.equal(isInteractiveCardTarget(miss as unknown as EventTarget), false);
    assert.equal(isInteractiveCardTarget(null), false);
  });
});
