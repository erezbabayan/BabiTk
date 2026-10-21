import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  claimLocalReminderPopup,
  resetReminderPopupClaimsForTests,
  wasLocalReminderItemClaimed,
} from "./reminder-popup-dedupe.ts";

describe("reminder popup dedupe", () => {
  it("claims an item before a second dialog can open", () => {
    resetReminderPopupClaimsForTests();
    assert.equal(wasLocalReminderItemClaimed("task-1"), false);
    claimLocalReminderPopup("task-1");
    assert.equal(wasLocalReminderItemClaimed("task-1"), true);
    assert.equal(wasLocalReminderItemClaimed("task-2"), false);
    assert.equal(wasLocalReminderItemClaimed(null), false);
  });
});
