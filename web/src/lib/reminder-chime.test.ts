import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { reminderServiceWorkerUrl } from "./reminder-chime.js";

describe("reminderServiceWorkerUrl", () => {
  it("keeps GitHub Pages project base path", () => {
    assert.equal(reminderServiceWorkerUrl("/BabiTk/"), "/BabiTk/reminder-sw.js");
  });

  it("adds a trailing slash when missing", () => {
    assert.equal(reminderServiceWorkerUrl("/"), "/reminder-sw.js");
    assert.equal(reminderServiceWorkerUrl("/app"), "/app/reminder-sw.js");
  });
});
