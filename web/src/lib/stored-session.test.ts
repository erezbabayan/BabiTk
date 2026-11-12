import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hasStoredSupabaseSession } from "./stored-session.ts";

function store(keys: string[]) {
  return { length: keys.length, key: (i: number) => keys[i] ?? null };
}

describe("stored session hint (prefetch board vs login)", () => {
  it("detects a Supabase auth token in either storage", () => {
    assert.equal(hasStoredSupabaseSession([store(["x"]), store(["sb-abc-auth-token"])]), true);
  });
  it("is false without one", () => {
    assert.equal(hasStoredSupabaseSession([store(["babitk:foo"]), store([])]), false);
  });
});
