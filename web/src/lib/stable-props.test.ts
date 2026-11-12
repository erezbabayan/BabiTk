import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { stablePropsEqual, wrapHandlers } from "./stable-props.ts";

describe("stable item-card handlers", () => {
  it("keeps wrapper identity across renders and always calls the latest callback", () => {
    const cache = new Map();
    let current: Record<string, unknown> = { id: "a", onPress: () => "first" };
    const r1 = wrapHandlers(current, () => current, cache);
    current = { id: "a", onPress: () => "second" };
    const r2 = wrapHandlers(current, () => current, cache);
    assert.equal(r1.onPress, r2.onPress);
    assert.equal((r1.onPress as () => string)(), "second", "no stale closure");
  });

  it("calls nothing when the latest prop was removed", () => {
    const cache = new Map();
    let current: Record<string, unknown> = { onPress: () => 1 };
    const r1 = wrapHandlers(current, () => current, cache);
    current = {};
    assert.equal((r1.onPress as () => unknown)(), undefined);
  });

  it("wraps functions inside nested swipe-action objects", () => {
    const cache = new Map();
    let calls = "";
    let current: Record<string, unknown> = { leftAction: { label: "x", onTrigger: () => (calls += "old") } };
    const r1 = wrapHandlers(current, () => current, cache, ["leftAction"]);
    current = { leftAction: { label: "x", onTrigger: () => (calls += "new") } };
    (r1.leftAction as { onTrigger: () => void }).onTrigger();
    assert.equal(calls, "new");
  });

  it("memo equality: same data + wrapped handlers are equal; data change is not", () => {
    const eq = stablePropsEqual(["leftAction"]);
    const f = () => undefined;
    const item = { id: "a" };
    assert.equal(eq({ item, onPress: f, leftAction: { label: "x", onTrigger: () => 1 } }, { item, onPress: f, leftAction: { label: "x", onTrigger: () => 2 } }), true);
    assert.equal(eq({ item, onPress: f }, { item: { id: "a" }, onPress: f }), false);
    assert.equal(eq({ item, leftAction: { label: "x" } }, { item, leftAction: { label: "y" } }), false);
    assert.equal(eq({ item, selected: false }, { item, selected: true }), false);
    assert.equal(eq({ item, onPress: f }, { item }), false, "handler presence matters");
  });
});
