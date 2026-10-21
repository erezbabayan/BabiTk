import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  acceptsDemoSyncToken,
  DEFAULT_DEMO_SYNC_TOKEN,
} from "../lib/demo-sync-token.js";

describe("אסימון סנכרון בפרודקשן", () => {
  it("דוחה את אסימון ברירת המחדל גם אם הוגדר במפורש", () => {
    assert.equal(
      acceptsDemoSyncToken(DEFAULT_DEMO_SYNC_TOKEN, {
        nodeEnv: "production",
        configuredToken: DEFAULT_DEMO_SYNC_TOKEN,
      }),
      false,
    );
  });

  it("מקבל אסימון אחר שהוגדר לפרודקשן", () => {
    assert.equal(
      acceptsDemoSyncToken("secret-sync-token", {
        nodeEnv: "production",
        configuredToken: "secret-sync-token",
      }),
      true,
    );
    assert.equal(
      acceptsDemoSyncToken(DEFAULT_DEMO_SYNC_TOKEN, {
        nodeEnv: "production",
        configuredToken: "secret-sync-token",
      }),
      false,
    );
  });

  it("ממשיך לקבל את ברירת המחדל מחוץ לפרודקשן", () => {
    assert.equal(
      acceptsDemoSyncToken(DEFAULT_DEMO_SYNC_TOKEN, {
        nodeEnv: "development",
        configuredToken: DEFAULT_DEMO_SYNC_TOKEN,
      }),
      true,
    );
    assert.equal(
      acceptsDemoSyncToken("אחר", {
        nodeEnv: "development",
        configuredToken: DEFAULT_DEMO_SYNC_TOKEN,
      }),
      false,
    );
  });
});
