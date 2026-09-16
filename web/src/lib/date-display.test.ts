import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ddMmYyyyToIsoDate,
  formatLocalDateDdMmYyyy,
  isoDateToDdMmYyyy,
} from "./date-display.js";

describe("date display dd/mm/yyyy", () => {
  it("formats a stored ISO date as day/month/year", () => {
    assert.equal(isoDateToDdMmYyyy("2026-09-18"), "18/09/2026");
  });

  it("parses day/month/year and rejects month-first American dates", () => {
    assert.equal(ddMmYyyyToIsoDate("18/09/2026"), "2026-09-18");
    assert.equal(ddMmYyyyToIsoDate("18.9.2026"), "2026-09-18");
    assert.equal(ddMmYyyyToIsoDate("18092026"), "2026-09-18");
    assert.equal(ddMmYyyyToIsoDate("09/18/2026"), null);
  });

  it("formats a local Date as zero-padded dd/mm/yyyy", () => {
    const date = new Date(2026, 8, 18, 15, 30, 0);
    assert.equal(formatLocalDateDdMmYyyy(date), "18/09/2026");
  });
});
