import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveIsDesktopBoard } from "../lib/board-layout-mode.js";

describe("resolveIsDesktopBoard", () => {
  it("shows triple board on wide desktop with mouse", () => {
    assert.equal(
      resolveIsDesktopBoard({
        minWidth1024: true,
        pointerFine: true,
        hoverHover: true,
        isAndroid: false,
      }),
      true,
    );
  });

  it("keeps single board on Android even when width looks desktop", () => {
    assert.equal(
      resolveIsDesktopBoard({
        minWidth1024: true,
        pointerFine: true,
        hoverHover: true,
        isAndroid: true,
      }),
      false,
    );
  });

  it("keeps single board when UA Client Hints say mobile", () => {
    assert.equal(
      resolveIsDesktopBoard({
        minWidth1024: true,
        pointerFine: true,
        hoverHover: true,
        isAndroid: false,
        uaMobile: true,
      }),
      false,
    );
  });

  it("keeps single board on touch tablets (coarse pointer)", () => {
    assert.equal(
      resolveIsDesktopBoard({
        minWidth1024: true,
        pointerFine: false,
        hoverHover: false,
        isAndroid: false,
      }),
      false,
    );
  });

  it("keeps single board on narrow phones", () => {
    assert.equal(
      resolveIsDesktopBoard({
        minWidth1024: false,
        pointerFine: false,
        hoverHover: false,
        isAndroid: true,
      }),
      false,
    );
  });
});
