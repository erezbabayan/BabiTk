import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LIVE_CAPTURE_VERSION,
  webhookReportsLiveCapture,
} from "./whatsapp-webhook-health.ts";

describe("webhookReportsLiveCapture", () => {
  it("rejects the currently live webhook payload without a capture version", () => {
    assert.equal(
      webhookReportsLiveCapture({
        ok: true,
        qa: "babi-v5",
        layout: "task-v1",
      }),
      false,
    );
  });

  it("accepts the group-LID capture version", () => {
    assert.equal(
      webhookReportsLiveCapture({
        ok: true,
        qa: "babi-v5",
        capture: LIVE_CAPTURE_VERSION,
      }),
      true,
    );
  });
});
