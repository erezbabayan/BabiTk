import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseGreenApiWebhook,
  unwrapGreenApiWebhook,
} from "../../../convex/lib/greenApiParser.js";
import {
  answerWhatsAppSystemQuestion,
  parseWhatsAppSystemQuestion,
} from "../lib/whatsapp-system-question.js";
import {
  itemMatchesBriefingDay,
  parseWhatsAppQuery,
  buildTaskBriefing,
} from "../lib/whatsapp-query.js";
import { parseWhatsAppCommand } from "../lib/whatsapp-commands.js";
import { resolveWhatsAppTextIntent } from "../lib/whatsapp-text-intent.js";

const OWNER_WID = "972526448067@c.us";
const CAPTURE_GROUP = "120363000000000001@g.us";
const PEER = "972501234567@c.us";
const NOW = new Date("2026-09-17T12:00:00+03:00");
const TAGS = ["עבודה", "לימודים"];

const OPEN_ITEMS = [
  {
    title: "שיחת לקוח",
    content: "שיחה עם רועי",
    isActionable: true,
    dueDate: "2026-09-17T10:30:00+03:00",
    tags: ["עבודה"],
    status: "pending",
    due_date: "2026-09-17T10:30:00+03:00",
  },
  {
    title: "לקנות חלב",
    content: "מהסופר",
    isActionable: true,
    dueDate: null,
    tags: ["בית"],
    status: "inbox",
    due_date: null,
  },
  {
    title: "קוד wifi",
    content: "12345678",
    isActionable: false,
    dueDate: null,
    tags: ["קודים"],
    status: "pending",
    due_date: null,
  },
];

function groupQuestionPayload(text: string, extra: Record<string, unknown> = {}) {
  return {
    typeWebhook: "outgoingMessageReceived",
    idMessage: "q-1",
    instanceData: { wid: OWNER_WID, idInstance: 7103000001 },
    senderData: {
      chatId: CAPTURE_GROUP,
      sender: OWNER_WID,
      chatName: "BabiTk קליטה",
    },
    messageData: {
      typeMessage: "textMessage",
      textMessageData: { textMessage: text },
    },
    ...extra,
  };
}

describe("WhatsApp group Q&A path", () => {
  it("unwraps Green-API { receiptId, body } envelopes", () => {
    const inner = groupQuestionPayload("מה יש לי היום");
    const unwrapped = unwrapGreenApiWebhook({ receiptId: 9, body: inner });
    assert.equal(unwrapped.typeWebhook, "outgoingMessageReceived");
    const parsed = parseGreenApiWebhook({ receiptId: 9, body: inner });
    assert.equal(parsed.messages[0]?.text, "מה יש לי היום");
    assert.equal(parsed.messages[0]?.fromOwner, true);
  });

  it("reads quoted replies from extendedText, not the quoted original", () => {
    const parsed = parseGreenApiWebhook(
      groupQuestionPayload("* חלב", {
        messageData: {
          typeMessage: "quotedMessage",
          extendedTextMessageData: { text: "* חלב" },
          quotedMessage: { textMessage: "תזכורת ישנה" },
        },
      }),
    );
    assert.equal(parsed.messages[0]?.text, "* חלב");
  });

  it("reads incoming group questions from a non-owner for Q&A", () => {
    const parsed = parseGreenApiWebhook({
      typeWebhook: "incomingMessageReceived",
      idMessage: "peer-q",
      instanceData: { wid: OWNER_WID },
      senderData: { chatId: CAPTURE_GROUP, sender: PEER },
      messageData: {
        typeMessage: "textMessage",
        textMessageData: { textMessage: "* מה יש לי היום" },
      },
    });
    assert.equal(parsed.messages[0]?.fromOwner, false);
    assert.equal(parsed.messages[0]?.text, "* מה יש לי היום");
  });

  it("uses senderPn when the group sender is a LID", () => {
    const parsed = parseGreenApiWebhook({
      typeWebhook: "incomingMessageReceived",
      idMessage: "lid-q",
      instanceData: { wid: OWNER_WID },
      senderData: {
        chatId: CAPTURE_GROUP,
        sender: "123456789012345@lid",
        senderPn: OWNER_WID,
      },
      messageData: {
        typeMessage: "textMessage",
        textMessageData: { textMessage: "מה בתיבה" },
      },
    });
    assert.equal(parsed.messages[0]?.fromOwner, true);
    assert.equal(parsed.messages[0]?.text, "מה בתיבה");
  });

  it("maps canned and free questions to a board query that pulls tasks", () => {
    assert.equal(resolveWhatsAppTextIntent("1", TAGS).type, "query");
    assert.deepEqual(resolveWhatsAppTextIntent("מה יש לי היום", TAGS), {
      type: "query",
      query: { type: "query", day: "today", tag: null },
      fallbackSearch: null,
    });
    assert.deepEqual(resolveWhatsAppTextIntent("* מה המשימות מחר בעבודה", TAGS), {
      type: "query",
      query: { type: "query", day: "tomorrow", tag: "עבודה" },
      fallbackSearch: "מה המשימות מחר בעבודה",
    });
    const today = OPEN_ITEMS.filter((item) =>
      itemMatchesBriefingDay(item, "today", NOW),
    );
    assert.equal(today.length, 1);
    assert.equal(today[0]?.title, "שיחת לקוח");
    const briefing = buildTaskBriefing(today, { type: "query", day: "today", tag: null });
    assert.match(briefing, /שיחת לקוח/);
    assert.doesNotMatch(briefing, /לא נרשם פריט/);
  });

  it("does not treat capture sentences or snooze replies as questions", () => {
    assert.equal(resolveWhatsAppTextIntent("לקנות חלב מחר", TAGS).type, "ingest");
    assert.equal(resolveWhatsAppTextIntent("מחר יש לי ישיבה", TAGS).type, "ingest");
    assert.equal(parseWhatsAppQuery("מחר יש לי ישיבה", TAGS), null);
    assert.equal(resolveWhatsAppTextIntent("מחר", TAGS).type, "command");
    assert.equal(parseWhatsAppCommand("מחר")?.type, "tomorrow");
  });

  it("searches open items for starred lookups including notes", () => {
    assert.deepEqual(parseWhatsAppSystemQuestion("* חלב"), {
      kind: "question",
      question: "חלב",
    });
    assert.equal(resolveWhatsAppTextIntent("* חלב", TAGS).type, "search");
    const reply = answerWhatsAppSystemQuestion(
      { kind: "question", question: "חלב" },
      OPEN_ITEMS,
      NOW,
    );
    assert.match(reply, /לקנות חלב/);
    assert.match(reply, /לא נרשם פריט/);
    const notes = answerWhatsAppSystemQuestion(
      { kind: "question", question: "הערות" },
      OPEN_ITEMS,
      NOW,
    );
    assert.match(notes, /קוד wifi/);
  });

  it("falls back to a search when a starred today-question has no dated tasks", () => {
    const intent = resolveWhatsAppTextIntent("* מה יש לי היום", TAGS);
    assert.equal(intent.type, "query");
    if (intent.type !== "query") return;
    assert.equal(intent.fallbackSearch, "מה יש לי היום");
    const datedToday = OPEN_ITEMS.filter((item) =>
      itemMatchesBriefingDay({ due_date: item.due_date, status: item.status }, "today", NOW),
    );
    assert.equal(datedToday.length, 1);
    const emptyToday = OPEN_ITEMS.filter((item) =>
      itemMatchesBriefingDay(
        { due_date: item.title === "שיחת לקוח" ? null : item.due_date, status: item.status },
        "today",
        NOW,
      ),
    );
    assert.equal(emptyToday.length, 0);
    const fallback = answerWhatsAppSystemQuestion(
      { kind: "question", question: intent.fallbackSearch ?? "" },
      OPEN_ITEMS.filter((item) => item.title !== "שיחת לקוח"),
      NOW,
    );
    assert.match(fallback, /לא מצאתי|בתיבה|לקנות חלב|אין/);
  });

  it("includes inbox tasks in plan-my-day", () => {
    assert.equal(
      itemMatchesBriefingDay({ due_date: null, status: "inbox" }, "plan", NOW),
      true,
    );
    assert.equal(
      itemMatchesBriefingDay(
        { due_date: "2026-09-17T10:00:00+03:00", status: "pending" },
        "plan",
        NOW,
      ),
      true,
    );
    assert.equal(
      itemMatchesBriefingDay(
        { due_date: "2026-09-19T10:00:00+03:00", status: "pending" },
        "plan",
        NOW,
      ),
      false,
    );
  });

  it("mentions inbox count when a day briefing is empty", () => {
    const text = buildTaskBriefing([], { type: "query", day: "today", tag: null }, "Asia/Jerusalem", {
      inboxCount: 3,
    });
    assert.match(text, /אין משימות היום/);
    assert.match(text, /בתיבה יש 3 פריטים/);
  });
});
