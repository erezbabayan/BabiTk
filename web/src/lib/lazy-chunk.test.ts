import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chunkLoader, isChunkLoadError, shouldReloadForChunkError } from "./lazy-chunk.ts";

describe("lazy chunk loading", () => {
  it("recognises stale-deploy chunk errors", () => {
    assert.equal(isChunkLoadError(new Error("Failed to fetch dynamically imported module: x.js")), true);
    assert.equal(isChunkLoadError(new Error("Importing a module script failed.")), true);
    assert.equal(isChunkLoadError(new Error("boom")), false);
  });

  it("reloads at most once per 30s (no reload loop)", () => {
    const err = new Error("Failed to fetch dynamically imported module");
    assert.equal(shouldReloadForChunkError(err, null, 1_000), true);
    assert.equal(shouldReloadForChunkError(err, 1_000, 10_000), false);
    assert.equal(shouldReloadForChunkError(err, 1_000, 40_000), true);
    assert.equal(shouldReloadForChunkError(new Error("boom"), null, 1_000), false);
  });

  it("shares one import between prefetch and render, retries after failure", async () => {
    let calls = 0;
    let fail = true;
    const load = chunkLoader(async () => {
      calls += 1;
      if (fail) throw new Error("net");
      return { ok: true };
    });
    await assert.rejects(load());
    fail = false;
    const [a, b] = await Promise.all([load(), load()]);
    assert.equal(a, b);
    assert.equal(calls, 2);
  });
});
