import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isOwnerAccount } from "../lib/owner-account.js";

describe("isOwnerAccount", () => {
  it("matches Erez Babian by email", () => {
    assert.equal(isOwnerAccount({ email: "erezbabayan@gmail.com" }), true);
    assert.equal(isOwnerAccount({ email: "  ErezBabayan@gmail.com  " }), true);
  });

  it("matches owner login usernames", () => {
    assert.equal(isOwnerAccount({ username: "erezbababan" }), true);
    assert.equal(isOwnerAccount({ username: "erezbabayan" }), true);
  });

  it("does not match other users", () => {
    assert.equal(isOwnerAccount({ email: "other@example.com" }), false);
    assert.equal(isOwnerAccount({ username: "arez" }), false);
    assert.equal(isOwnerAccount({}), false);
  });
});
