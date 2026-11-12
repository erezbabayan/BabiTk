import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { startVisibleInterval } from "./visible-interval.ts";

function harness(initiallyHidden = false) {
  let now = 0;
  let hidden = initiallyHidden;
  const listeners = new Set<() => void>();
  const intervals = new Map<number, { fn: () => void; ms: number; next: number }>();
  let nextId = 1;
  const doc = {
    get hidden() {
      return hidden;
    },
    addEventListener: (_: "visibilitychange", l: () => void) => listeners.add(l),
    removeEventListener: (_: "visibilitychange", l: () => void) => listeners.delete(l),
  };
  const timers = {
    setInterval(fn: () => void, ms: number) {
      const id = nextId++;
      intervals.set(id, { fn, ms, next: now + ms });
      return id;
    },
    clearInterval(id: unknown) {
      intervals.delete(id as number);
    },
    now: () => now,
  };
  return {
    doc,
    timers,
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...intervals.values()].filter((t) => t.next <= end).sort((a, b) => a.next - b.next)[0];
        if (!due) break;
        now = due.next;
        due.next += due.ms;
        due.fn();
      }
      now = end;
    },
    setHidden(value: boolean) {
      hidden = value;
      for (const l of [...listeners]) l();
    },
    listenerCount: () => listeners.size,
    intervalCount: () => intervals.size,
  };
}

const opts = { intervalMs: 300_000, minGapMs: 20_000 };

describe("visible interval (WhatsApp group catch-up)", () => {
  it("runs once on start and then every 5 minutes while visible", () => {
    const h = harness();
    let runs = 0;
    startVisibleInterval(() => runs++, { ...opts, doc: h.doc, timers: h.timers });
    assert.equal(runs, 1);
    h.advance(299_000);
    assert.equal(runs, 1);
    h.advance(1_000);
    assert.equal(runs, 2);
  });

  it("does no work while hidden and runs on return to the tab", () => {
    const h = harness();
    let runs = 0;
    startVisibleInterval(() => runs++, { ...opts, doc: h.doc, timers: h.timers });
    h.setHidden(true);
    assert.equal(h.intervalCount(), 0);
    h.advance(3_600_000);
    assert.equal(runs, 1);
    h.setHidden(false);
    assert.equal(runs, 2);
    assert.equal(h.intervalCount(), 1);
  });

  it("does not re-run when the tab flips back within the minimum gap", () => {
    const h = harness();
    let runs = 0;
    startVisibleInterval(() => runs++, { ...opts, doc: h.doc, timers: h.timers });
    h.advance(5_000);
    h.setHidden(true);
    h.setHidden(false);
    assert.equal(runs, 1);
  });

  it("starting hidden skips the first run until visible", () => {
    const h = harness(true);
    let runs = 0;
    startVisibleInterval(() => runs++, { ...opts, doc: h.doc, timers: h.timers });
    assert.equal(runs, 0);
    h.setHidden(false);
    assert.equal(runs, 1);
  });

  it("cleanup removes the listener and the timer", () => {
    const h = harness();
    const stop = startVisibleInterval(() => undefined, { ...opts, doc: h.doc, timers: h.timers });
    stop();
    assert.equal(h.listenerCount(), 0);
    assert.equal(h.intervalCount(), 0);
  });
});
