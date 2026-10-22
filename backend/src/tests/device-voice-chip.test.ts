import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEVICE_VOICE_CHIP_LABEL,
  isDeviceVoiceItem,
} from "../../../convex/lib/deviceVoiceChip.ts";

describe("device voice chip", () => {
  it("matches only voice-ingest tasks", () => {
    assert.equal(DEVICE_VOICE_CHIP_LABEL, "🎙️ מהכפתור");
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
