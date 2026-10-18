import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ensureWhatsAppMessageId,
  isSoftDeletedCapturedItem,
  isStableWhatsAppMessageId,
  preferLiveCapturedItem,
  shouldSkipWhatsAppRecapture,
} from "../../../supabase/functions/_shared/whatsapp-ingest-state.ts";

describe("whatsapp ingest tombstones", () => {
  it("treats a soft-deleted row as already captured", () => {
    const deleted = { id: "gone", deleted_at: "2026-10-16T04:00:00.000Z" };
    assert.equal(isSoftDeletedCapturedItem(deleted), true);
    assert.equal(shouldSkipWhatsAppRecapture(deleted), true);
    assert.equal(shouldSkipWhatsAppRecapture(null), false);
  });

  it("prefers a live row but still returns the deleted tombstone", () => {
    const deleted = { id: "gone", deleted_at: "2026-10-16T04:00:00.000Z" };
    const live = { id: "live", deleted_at: null };
    assert.equal(preferLiveCapturedItem([deleted, live])?.id, "live");
    assert.equal(preferLiveCapturedItem([deleted])?.id, "gone");
  });

  it("rejects unstable Green-API fallback ids", () => {
    assert.equal(isStableWhatsAppMessageId(""), false);
    assert.equal(isStableWhatsAppMessageId("green-1710000000000"), false);
    assert.equal(isStableWhatsAppMessageId("true_123@c.us_ABCDEF"), true);
  });

  it("mints a durable wa- id when Green-API omitted idMessage", () => {
    const minted = ensureWhatsAppMessageId("");
    assert.match(minted, /^wa-[0-9a-f-]+$/i);
    assert.equal(isStableWhatsAppMessageId(minted), true);
    assert.equal(
      ensureWhatsAppMessageId("true_123@c.us_ABCDEF"),
      "true_123@c.us_ABCDEF",
    );
    const fromGreen = ensureWhatsAppMessageId("green-1710000000000");
    assert.match(fromGreen, /^wa-/);
    assert.notEqual(fromGreen, "green-1710000000000");
  });
});
