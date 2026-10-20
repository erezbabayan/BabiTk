import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  collectGroupsFromItemMetadata,
  collectGroupsFromUnknown,
  collectJournalTexts,
  isPersonalCaptureLabel,
  parseGroupChatId,
  pickMatchingGroup,
  selectCatchupMessages,
  shouldCatchupCaptureText,
} from "../../../supabase/functions/_shared/green-api-chats.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("parseGroupChatId", () => {
  it("extracts a @g.us id from pasted text", () => {
    assert.equal(parseGroupChatId("120363012345678901@g.us"), "120363012345678901@g.us");
    assert.equal(
      parseGroupChatId("קבוצה 120363012345678901@g.us"),
      "120363012345678901@g.us",
    );
    assert.equal(parseGroupChatId("משימות ארז"), null);
    assert.equal(parseGroupChatId("972501234567@c.us"), null);
  });
});

describe("pickMatchingGroup", () => {
  const groups = [
    { chatId: "120363aaa@g.us", name: "משימות ארז" },
    { chatId: "120363bbb@g.us", name: "משפחה" },
  ];

  it("matches an exact or partial Hebrew name", () => {
    assert.equal(pickMatchingGroup(groups, "משימות ארז")?.chatId, "120363aaa@g.us");
    assert.equal(pickMatchingGroup(groups, "משימות")?.chatId, "120363aaa@g.us");
  });

  it("accepts a pasted group id even when it is not in the list", () => {
    assert.equal(
      pickMatchingGroup(groups, "120363zzz@g.us")?.chatId,
      "120363zzz@g.us",
    );
  });
});

describe("collectGroupsFromUnknown", () => {
  it("reads journal rows and nested senderData", () => {
    const groups = collectGroupsFromUnknown([
      { chatId: "120363aaa@g.us", chatName: "משימות ארז" },
      {
        senderData: { chatId: "120363bbb@g.us", chatName: "משפחה" },
        typeMessage: "textMessage",
      },
      { chatId: "972501234567@c.us", name: "אישי" },
    ]);
    assert.deepEqual(
      groups.map((row) => row.chatId).sort(),
      ["120363aaa@g.us", "120363bbb@g.us"],
    );
  });
});

describe("collectGroupsFromItemMetadata", () => {
  it("keeps @g.us ids from item metadata", () => {
    const groups = collectGroupsFromItemMetadata([
      { title: "לקבלן", metadata: { chat_id: "120363zzz@g.us" } },
      { title: "אישי", metadata: { chat_id: "972501234567@c.us" } },
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.chatId, "120363zzz@g.us");
  });
});

describe("isPersonalCaptureLabel", () => {
  it("treats the default Message Yourself label as personal", () => {
    assert.equal(isPersonalCaptureLabel("הודעה לעצמי (BabiTk)"), true);
    assert.equal(isPersonalCaptureLabel("משימות ארז"), false);
  });
});

describe("catch-up journal texts", () => {
  it("keeps owner group tasks and skips questions", () => {
    assert.equal(
      shouldCatchupCaptureText(
        "לקבלן מאליקים הוראת שינוי-הגדלה בפרויקט ברקן 2 , לבדוק מולו עוד יומיים",
      ),
      true,
    );
    assert.equal(shouldCatchupCaptureText("בבי מה המשימות היום"), false);
    assert.equal(shouldCatchupCaptureText("תפריט"), false);
    const rows = collectJournalTexts([
      {
        idMessage: "out-1",
        type: "outgoing",
        chatId: "120363aaa@g.us",
        textMessage:
          "לקבלן מאליקים הוראת שינוי-הגדלה בפרויקט ברקן 2 , לבדוק מולו עוד יומיים",
        timestamp: 1_700_000_000,
      },
      {
        idMessage: "in-q",
        type: "incoming",
        chatId: "120363aaa@g.us",
        textMessage: "בבי מה יש היום",
        timestamp: 1_700_000_100,
      },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.messageId, "out-1");
    const selected = selectCatchupMessages(rows, null, 1_700_000_200);
    assert.equal(selected.length, 1);
  });

  it("treats lastOutgoingMessages rows as outgoing even when type is outgoingMessage", () => {
    const rows = collectJournalTexts(
      [
        {
          id: "hist-1",
          type: "outgoingMessage",
          chatId: "120363aaa@g.us",
          textMessage: "לקבלן מאליקים לבדוק מולו עוד יומיים",
          timestamp: 1_700_000_000,
        },
      ],
      "",
      { defaultOutgoing: true },
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.messageId, "hist-1");
    assert.equal(rows[0]?.outgoing, true);
  });

  it("keeps incoming contractor texts once the capture group id is bound", () => {
    const rows = collectJournalTexts([
      {
        idMessage: "in-1",
        type: "incoming",
        chatId: "120363aaa@g.us",
        textMessage: "שלחתי הצעת מחיר",
        timestamp: 1_700_000_050,
      },
    ]);
    assert.equal(rows.length, 1);
    const unbound = selectCatchupMessages(rows, null, 1_700_000_200);
    assert.equal(unbound.length, 0);
    const bound = selectCatchupMessages(rows, "120363aaa@g.us", 1_700_000_200);
    assert.equal(bound.length, 1);
  });
});

describe("settings persist the group chat id", () => {
  it("saves whatsapp_capture_group_chat_id from the matched group", () => {
    const source = readFileSync(
      join(here, "../components/SupabasePhoneLinkSettings.tsx"),
      "utf8",
    );
    assert.match(source, /resolveCaptureGroup/);
    assert.match(source, /whatsapp_capture_group_chat_id: matched.chatId/);
    assert.match(source, /autoBindAttempted/);
    assert.match(source, /catchUpWhatsAppGroupInbox/);
    assert.equal(
      source.includes("whatsapp_capture_group_chat_id: profile?.whatsapp_capture_group_chat_id ?? null"),
      false,
    );
  });
});

describe("server-side group inbox catch-up", () => {
  it("tries the connect function before Green-API in the browser", () => {
    const source = readFileSync(join(here, "whatsapp-group-catchup.ts"), "utf8");
    assert.match(source, /action: "catchupInbox"/);
    assert.match(source, /row\.catchup !== true/);
  });

  it("exposes catchupInbox on the connect function", () => {
    const source = readFileSync(
      join(here, "../../../supabase/functions/whatsapp-green-connect/index.ts"),
      "utf8",
    );
    assert.match(source, /action === "catchupInbox"/);
    assert.match(source, /runWhatsAppGroupInboxCatchup/);
  });

  it("ships a service-role GitHub Action that does not need Edge Function deploy", () => {
    const source = readFileSync(
      join(here, "../../../.github/workflows/whatsapp-group-catchup.yml"),
      "utf8",
    );
    assert.match(source, /whatsapp-group-inbox-catchup.ts/);
    assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  });
});
