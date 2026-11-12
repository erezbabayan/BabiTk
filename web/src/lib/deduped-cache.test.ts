import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createDedupedCache } from "./deduped-cache.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("deduped profile cache", () => {
  it("shares one in-flight request between concurrent readers", async () => {
    const cache = createDedupedCache<number>(30_000);
    let calls = 0;
    const d = deferred<number>();
    const load = () => {
      calls += 1;
      return d.promise;
    };
    const a = cache.get("u1", load);
    const b = cache.get("u1", load);
    d.resolve(7);
    assert.deepEqual(await Promise.all([a, b]), [7, 7]);
    assert.equal(calls, 1);
  });

  it("serves from cache within the TTL and reloads after it", async () => {
    let t = 0;
    const cache = createDedupedCache<number>(30_000, () => t);
    let calls = 0;
    const load = async () => ++calls;
    assert.equal(await cache.get("u1", load), 1);
    t = 29_000;
    assert.equal(await cache.get("u1", load), 1);
    t = 31_000;
    assert.equal(await cache.get("u1", load), 2);
  });

  it("fresh bypasses the TTL cache", async () => {
    const cache = createDedupedCache<number>(30_000);
    let calls = 0;
    const load = async () => ++calls;
    await cache.get("u1", load);
    assert.equal(await cache.get("u1", load, { fresh: true }), 2);
  });

  it("is keyed per user", async () => {
    const cache = createDedupedCache<string>(30_000);
    assert.equal(await cache.get("u1", async () => "one"), "one");
    assert.equal(await cache.get("u2", async () => "two"), "two");
  });

  it("invalidate drops the cache and ignores a read that was in flight during a write", async () => {
    const cache = createDedupedCache<number>(30_000);
    const d = deferred<number>();
    const stale = cache.get("u1", () => d.promise);
    cache.invalidate();
    d.resolve(1);
    assert.equal(await stale, 1);
    let calls = 0;
    assert.equal(await cache.get("u1", async () => 100 + ++calls), 101);
  });

  it("does not cache failures", async () => {
    const cache = createDedupedCache<number>(30_000);
    await assert.rejects(cache.get("u1", async () => Promise.reject(new Error("x"))));
    assert.equal(await cache.get("u1", async () => 5), 5);
  });
});
