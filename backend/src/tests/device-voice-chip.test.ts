import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  DEVICE_VOICE_CHIP_LABEL,
  isDeviceVoiceItem,
} from "../../../convex/lib/deviceVoiceChip.ts";

describe("device voice chip", () => {
  it("matches only voice-ingest tasks", () => {
    assert.equal(DEVICE_VOICE_CHIP_LABEL, "BabiSnap");
    const root = path.resolve(import.meta.dirname, "../../..");
    for (const file of [
      "web/src/components/DeviceVoiceChip.tsx",
      "mobile/src/components/DeviceVoiceChip.tsx",
    ]) {
      const source = readFileSync(path.join(root, file), "utf8");
      assert.match(source, /babisnap-logo\.webp/);
      assert.match(source, /h-4 w-4|width: 16/);
      assert.match(source, /DEVICE_VOICE_CHIP_LABEL/);
    }
    assert.equal(isDeviceVoiceItem({ metadata: { source: "voice", channel: "voice" } }), true);
    assert.equal(
      isDeviceVoiceItem({
        metadata: {},
        source_materials: { source_type: "voice" },
      }),
      true,
    );
    assert.equal(isDeviceVoiceItem({ metadata: { source: "app_voice" } }), false);
    assert.equal(
      isDeviceVoiceItem({
        metadata: { source: "app_voice" },
        source_materials: { source_type: "voice" },
      }),
      false,
    );
    assert.equal(isDeviceVoiceItem({ metadata: { source: "whatsapp_voice" } }), false);
    assert.equal(isDeviceVoiceItem({ metadata: { source: "whatsapp_text" } }), false);
    assert.equal(
      isDeviceVoiceItem({ source_materials: { source_type: "whatsapp_voice" } }),
      false,
    );
    assert.equal(
      isDeviceVoiceItem({ source_materials: { source_type: "app_voice" } }),
      false,
    );
  });
});
