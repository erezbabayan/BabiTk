import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatIngestError } from "./ingest-error.js";

describe("formatIngestError", () => {
  it("does not show the raw Edge Function failure", () => {
    assert.equal(
      formatIngestError(new Error("Failed to send a request to the Edge Function")),
      "תמלול ההקלטה נכשל. נסו שוב בעוד רגע.",
    );
    assert.equal(
      formatIngestError(new Error("Requested function was not found")),
      "תמלול ההקלטה נכשל. נסו שוב בעוד רגע.",
    );
  });
});
