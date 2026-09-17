import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  answerWhatsAppSystemQuestion,
  isWhatsAppSystemQuestion,
  parseWhatsAppSystemQuestion,
  parseWhatsAppVoiceQuestion,
  type SystemQuestionItem,
} from "../lib/whatsapp-system-question.js";
import { parseWhatsAppQuery } from "../lib/whatsapp-query.js";
import { applyHebrewAsrSpellingFixes } from "../lib/ingest/hebrewAsrSpelling.js";

const NOW = new Date("2026-09-17T12:00:00+03:00");

const ITEMS: SystemQuestionItem[] = [
  {
    title: "לקנות חלב",
    content: "לקנות חלב מהסופר",
    isActionable: true,
    dueDate: "2026-09-17T09:00:00+03:00",
    tags: ["בית"],
    status: "pending",
  },
  {
    title: "להתקשר לרועי",
    content: "שיחה עם רועי על הפרויקט",
    isActionable: true,
    dueDate: "2026-09-18T10:00:00+03:00",
    tags: ["עבודה"],
    status: "inbox",
  },
  {
    title: "קוד wifi",
    content: "קוד wifi: 12345678",
    isActionable: false,
    dueDate: null,
    tags: ["קודים"],
    status: "pending",
  },
  {
    title: "לשלם חשבון",
    content: "חשמל שעבר מועד",
    isActionable: true,
    dueDate: "2026-09-15T09:00:00+03:00",
    tags: ["בית"],
    status: "pending",
  },
];

describe("parseWhatsAppSystemQuestion", () => {
  it("treats a leading asterisk as a system question", () => {
    assert.deepEqual(parseWhatsAppSystemQuestion("* מה יש לי היום"), {
      kind: "question",
      question: "מה יש לי היום",
    });
    assert.deepEqual(parseWhatsAppSystemQuestion("＊חלב"), {
      kind: "question",
      question: "חלב",
    });
    assert.equal(isWhatsAppSystemQuestion("* מה יש לי היום"), true);
  });

  it("treats a leading question mark as a system question", () => {
    assert.deepEqual(parseWhatsAppSystemQuestion("? מה המשימות"), {
      kind: "question",
      question: "מה המשימות",
    });
    assert.deepEqual(parseWhatsAppSystemQuestion("؟ חלב"), {
      kind: "question",
      question: "חלב",
    });
  });

  it("treats spoken בבי as a system question", () => {
    assert.deepEqual(parseWhatsAppSystemQuestion("בבי מה יש לי היום"), {
      kind: "question",
      question: "מה יש לי היום",
    });
    assert.deepEqual(parseWhatsAppSystemQuestion("babi-מה יש לי היום?"), {
      kind: "question",
      question: "מה יש לי היום?",
    });
    assert.deepEqual(parseWhatsAppSystemQuestion("שאלה למערכת איפה הקוד"), {
      kind: "question",
      question: "איפה הקוד",
    });
  });

  it("returns help when the prefix has no question", () => {
    assert.deepEqual(parseWhatsAppSystemQuestion("*"), { kind: "help" });
    assert.deepEqual(parseWhatsAppSystemQuestion("בבי"), { kind: "help" });
    assert.deepEqual(parseWhatsAppSystemQuestion("babi"), { kind: "help" });
    assert.deepEqual(parseWhatsAppSystemQuestion("?"), { kind: "help" });
  });

  it("leaves regular capture messages as ingest", () => {
    assert.deepEqual(parseWhatsAppSystemQuestion("לקנות חלב מחר"), { kind: "none" });
    assert.deepEqual(parseWhatsAppSystemQuestion("הערה: קוד wifi"), { kind: "none" });
    assert.deepEqual(parseWhatsAppSystemQuestion("בבית לקנות חלב"), { kind: "none" });
    assert.deepEqual(parseWhatsAppSystemQuestion("ביבי מה נשמע"), { kind: "none" });
    assert.equal(isWhatsAppSystemQuestion("לקנות *חלב* בסופר"), false);
  });

  it("treats WhatsApp bold wrap *שאלה* as a system question", () => {
    assert.deepEqual(parseWhatsAppSystemQuestion("*חלב*"), {
      kind: "question",
      question: "חלב",
    });
    assert.deepEqual(parseWhatsAppSystemQuestion("*מה יש לי היום*"), {
      kind: "question",
      question: "מה יש לי היום",
    });
  });

  it("treats a trailing asterisk or בבי as RTL question markup", () => {
    assert.deepEqual(parseWhatsAppSystemQuestion("חלב *"), {
      kind: "question",
      question: "חלב",
    });
    assert.deepEqual(parseWhatsAppSystemQuestion("מה יש לי היום בבי"), {
      kind: "question",
      question: "מה יש לי היום",
    });
  });
});

describe("parseWhatsAppVoiceQuestion", () => {
  it("treats a recorded בבי as a system question, including fillers", () => {
    assert.deepEqual(parseWhatsAppVoiceQuestion("אה בבי מה יש לי היום"), {
      kind: "question",
      question: "מה יש לי היום",
    });
    assert.deepEqual(parseWhatsAppVoiceQuestion("אוקיי, בבי חלב"), {
      kind: "question",
      question: "חלב",
    });
    assert.deepEqual(parseWhatsAppVoiceQuestion("תגידי בבי איפה הקוד"), {
      kind: "question",
      question: "איפה הקוד",
    });
    assert.deepEqual(parseWhatsAppVoiceQuestion("בבי מה יש לי היום?"), {
      kind: "question",
      question: "מה יש לי היום?",
    });
  });

  it("joins Whisper near-miss spellings of בבי", () => {
    assert.deepEqual(parseWhatsAppVoiceQuestion("אה באבי מה יש לי היום"), {
      kind: "question",
      question: "מה יש לי היום",
    });
    assert.deepEqual(parseWhatsAppVoiceQuestion("baby לקנות חלב"), {
      kind: "question",
      question: "לקנות חלב",
    });
    assert.deepEqual(parseWhatsAppVoiceQuestion("babi-מה המשימות"), {
      kind: "question",
      question: "מה המשימות",
    });
  });

  it("does not treat a spoken task as a question", () => {
    assert.deepEqual(parseWhatsAppVoiceQuestion("לקנות חלב מחר"), { kind: "none" });
    assert.deepEqual(parseWhatsAppVoiceQuestion("לקנות חלב?"), { kind: "none" });
    assert.deepEqual(parseWhatsAppVoiceQuestion("אה לקנות חלב"), { kind: "none" });
  });
});

describe("answerWhatsAppSystemQuestion", () => {
  it("answers without implying a new item was created", () => {
    const reply = answerWhatsAppSystemQuestion(
      { kind: "question", question: "מה יש לי היום" },
      ITEMS,
      NOW,
    );
    assert.match(reply, /לא נרשם פריט/);
    assert.match(reply, /לקנות חלב/);
    assert.doesNotMatch(reply, /להתקשר לרועי/);
  });

  it("searches open tasks and notes", () => {
    const reply = answerWhatsAppSystemQuestion(
      { kind: "question", question: "חלב" },
      ITEMS,
      NOW,
    );
    assert.match(reply, /לקנות חלב/);
    assert.doesNotMatch(reply, /קוד wifi/);
  });

  it("answers note lookups", () => {
    const reply = answerWhatsAppSystemQuestion(
      { kind: "question", question: "הערות" },
      ITEMS,
      NOW,
    );
    assert.match(reply, /קוד wifi/);
    assert.doesNotMatch(reply, /לקנות חלב/);
  });

  it("explains the prefix when only * is sent", () => {
    const reply = answerWhatsAppSystemQuestion({ kind: "help" }, ITEMS, NOW);
    assert.match(reply, /לא נרשם פריט/);
    assert.match(reply, /בבי/);
  });

  it("says when nothing matches", () => {
    const reply = answerWhatsAppSystemQuestion(
      { kind: "question", question: "פסטה" },
      ITEMS,
      NOW,
    );
    assert.match(reply, /לא מצאתי/);
    assert.match(reply, /בלי בבי/);
  });

  it("lists overdue tasks for date-passed questions", () => {
    const reply = answerWhatsAppSystemQuestion(
      {
        kind: "question",
        question: "שלח לי את המשימות שלי שהתאריך שלהן עבר",
      },
      ITEMS,
      NOW,
    );
    assert.match(reply, /לשלם חשבון/);
    assert.match(reply, /באיחור/);
    assert.doesNotMatch(reply, /לקנות חלב/);
    assert.doesNotMatch(reply, /לא מצאתי/);
  });

  it("does not list a recurring task with a stale due date as overdue", () => {
    const items: SystemQuestionItem[] = [
      ...ITEMS,
      {
        title: "סנאט מילואים",
        content: "",
        isActionable: true,
        dueDate: "2026-09-10T09:00:00+03:00",
        tags: ["צבא"],
        status: "pending",
        metadata: { reminder_recurrence: "weekly" },
      },
    ];
    const overdueReply = answerWhatsAppSystemQuestion(
      { kind: "question", question: "משימות שהתאריך שלהן עבר" },
      items,
      NOW,
    );
    assert.match(overdueReply, /לשלם חשבון/);
    assert.doesNotMatch(overdueReply, /סנאט מילואים/);

    const todayReply = answerWhatsAppSystemQuestion(
      { kind: "question", question: "מה יש לי היום" },
      items,
      NOW,
    );
    assert.match(todayReply, /סנאט מילואים/);
  });
});

describe("spoken overdue questions", () => {
  it("strips בבי then matches the canned overdue briefing", () => {
    const parsed = parseWhatsAppVoiceQuestion("בבי מה המשימות שהתאריך שלהם עבר");
    assert.equal(parsed.kind, "question");
    if (parsed.kind !== "question") return;
    assert.deepEqual(parseWhatsAppQuery(parsed.question), {
      type: "query",
      day: "overdue",
      tag: null,
    });
    assert.deepEqual(
      parseWhatsAppQuery("שלח לי את המשימות שלי שהתאריך שלהן עבר"),
      { type: "query", day: "overdue", tag: null },
    );
  });
});

describe("hebrew ASR בבי", () => {
  it("normalizes Whisper near-misses of בבי", () => {
    assert.equal(applyHebrewAsrSpellingFixes("באבי מה יש לי היום"), "בבי מה יש לי היום");
    assert.equal(applyHebrewAsrSpellingFixes("baby חלב"), "בבי חלב");
    assert.equal(applyHebrewAsrSpellingFixes("babi tk מה המשימות"), "בבי מה המשימות");
  });
});
