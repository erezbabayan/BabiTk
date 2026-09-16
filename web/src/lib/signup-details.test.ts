import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  validateSignupDetails,
  validateSignupPassword,
} from "./signup-details.js";

describe("signup validation", () => {
  it("rejects short passwords", () => {
    assert.throws(() => validateSignupPassword("1234567"), /8/);
  });

  it("accepts passwords of at least 8 characters", () => {
    validateSignupPassword("12345678");
  });

  it("still requires a phone number", () => {
    assert.throws(
      () =>
        validateSignupDetails({
          firstName: "א",
          lastName: "ב",
          phone: "",
          username: "erez",
        }),
      /טלפון/,
    );
  });
});
