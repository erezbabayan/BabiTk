import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  TAG_FILTER_IDLE_LABEL,
  tagFilterAriaLabel,
  tagFilterTriggerLabel,
} from "./tag-filter.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("tag filter trigger", () => {
  it("keeps the idle label and uses only the tag name when a filter is active", () => {
    assert.equal(tagFilterTriggerLabel(null), "סינון");
    assert.equal(tagFilterTriggerLabel("משפחה"), "משפחה");
    assert.equal(tagFilterTriggerLabel("#עבודה"), "עבודה");
    assert.equal(tagFilterAriaLabel(null), "סינון תגיות");
    assert.equal(tagFilterAriaLabel("משפחה"), "סינון תגיות: משפחה");
    assert.equal(TAG_FILTER_IDLE_LABEL, "סינון");
  });

  it("truncates the active tag on one line in the board filter button", () => {
    const source = readFileSync(join(here, "../components/TagFilter.tsx"), "utf8");
    assert.match(source, /tagFilterTriggerLabel\(selected\)/);
    assert.match(source, /whitespace-nowrap/);
    assert.match(source, /truncate/);
    assert.match(source, /min-w-0/);
    assert.doesNotMatch(source, /סינון תגיות[\s\S]{0,80}formatTagLabel\(selected\)/);
  });
});
