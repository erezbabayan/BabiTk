import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  BABITK_CHIP_LABEL,
  WHATSAPP_CHIP_LABEL,
  itemSourceChip,
} from "../../../convex/lib/itemSourceChip.ts";

describe("item source chip", () => {
  it("maps every known source", () => {
    assert.equal(WHATSAPP_CHIP_LABEL, "WhatsApp");
    assert.equal(BABITK_CHIP_LABEL, "BabiTk");
    // BabiSnap / device voice: unchanged.
    assert.equal(itemSourceChip({ metadata: { source: "voice", channel: "voice" } }), "babisnap");
    assert.equal(itemSourceChip({ source_materials: { source_type: "voice" } }), "babisnap");
    // WhatsApp.
    for (const source of ["whatsapp_text", "whatsapp_voice", "whatsapp"]) {
      assert.equal(itemSourceChip({ metadata: { source } }), "whatsapp", source);
    }
    assert.equal(
      itemSourceChip({ metadata: { source: "image", whatsapp_message_id: "abc", chat_id: "1@c.us" } }),
      "whatsapp",
    );
    assert.equal(itemSourceChip({ metadata: { channel: "whatsapp" } }), "whatsapp");
    assert.equal(itemSourceChip({ source_materials: [{ source_type: "whatsapp_voice" }] }), "whatsapp");
    // Created inside BabiTk.
    assert.equal(itemSourceChip({ metadata: { source: "typed_text" } }), "babitk");
    assert.equal(
      itemSourceChip({ metadata: { source: "app_voice" }, source_materials: { source_type: "whatsapp_voice" } }),
      "babitk",
    );
    assert.equal(itemSourceChip({ metadata: { source: "notebook_ocr" } }), "babitk");
    assert.equal(itemSourceChip({ source_materials: { source_type: "typed_text" } }), "babitk");
    // Unknown stays chip-less.
    assert.equal(itemSourceChip({ metadata: { source: "image" } }), null);
    assert.equal(itemSourceChip({ metadata: null }), null);
    assert.equal(itemSourceChip({}), null);
  });

  it("uses bundled assets on web and mobile cards", () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    const web = readFileSync(path.join(root, "web/src/components/ItemSourceChip.tsx"), "utf8");
    assert.match(web, /whatsapp-logo\.svg/);
    assert.match(web, /babitk-logo\.webp/);
    const mobile = readFileSync(path.join(root, "mobile/src/components/ItemSourceChip.tsx"), "utf8");
    assert.match(mobile, /react-native-svg/);
    assert.match(mobile, /babitk-logo\.webp/);
    for (const file of [
      "web/src/components/ItemCard.tsx",
      "web/src/components/ItemEditModal.tsx",
      "web/src/components/TaskMonthCalendar.tsx",
      "mobile/src/components/SwipeableItem.tsx",
      "mobile/src/components/ItemEditModal.tsx",
      "mobile/src/components/TaskMonthCalendar.tsx",
    ]) {
      assert.match(readFileSync(path.join(root, file), "utf8"), /<ItemSourceChip item=\{item\} \/>/, file);
    }
  });
});
