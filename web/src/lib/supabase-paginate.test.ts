import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { collectPagedRows, SUPABASE_PAGE_SIZE } from "./supabase-paginate.ts";

describe("collectPagedRows", () => {
  it("walks every page until a short page", async () => {
    const pages = [
      Array.from({ length: SUPABASE_PAGE_SIZE }, (_, i) => i),
      [SUPABASE_PAGE_SIZE, SUPABASE_PAGE_SIZE + 1],
    ];
    const rows = await collectPagedRows<number>(async (from) => {
      const index = from / SUPABASE_PAGE_SIZE;
      return { data: pages[index] ?? [], error: null };
    });
    assert.equal(rows.length, SUPABASE_PAGE_SIZE + 2);
    assert.equal(rows[0], 0);
    assert.equal(rows.at(-1), SUPABASE_PAGE_SIZE + 1);
  });

  it("throws the page error", async () => {
    await assert.rejects(
      () => collectPagedRows(async () => ({ data: null, error: { message: "boom" } })),
      /boom/,
    );
  });
});
