import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  answerWhatsAppSystemQuestion,
  isWhatsAppSystemQuestion,
  parseWhatsAppSystemQuestion,
  type SystemQuestionItem,
} from "../lib/whatsapp-system-question.js";
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

  it("treats spoken כוכבית as a system question", () => {
    assert.deepEqual(parseWhatsAppSystemQuestion("כוכבית מה יש לי היום"), {
      kind: "question",
      question: "מה יש לי היום",
    });
    assert.deepEqual(parseWhatsAppSystemQuestion("כוכב ית לקנות חלב"), {
      kind: "question",
      question: "לקנות חלב",
    });
    assert.deepEqual(parseWhatsAppSystemQuestion("שאלה למערכת איפה הקוד"), {
      kind: "question",
      question: "איפה הקוד",
    });
  });

  it("returns help when the prefix has no question", () => {
    assert.deepEqual(parseWhatsAppSystemQuestion("*"), { kind: "help" });
    assert.deepEqual(parseWhatsAppSystemQuestion("כוכבית"), { kind: "help" });
    assert.deepEqual(parseWhatsAppSystemQuestion("?"), { kind: "help" });
  });

  it("leaves regular capture messages as ingest", () => {
    assert.deepEqual(parseWhatsAppSystemQuestion("לקנות חלב מחר"), { kind: "none" });
    assert.deepEqual(parseWhatsAppSystemQuestion("הערה: קוד wifi"), { kind: "none" });
    assert.equal(isWhatsAppSystemQuestion("לקנות *חלב* בסופר"), false);
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
    assert.match(reply, /כוכבית/);
  });

  it("says when nothing matches", () => {
    const reply = answerWhatsAppSystemQuestion(
      { kind: "question", question: "פסטה" },
      ITEMS,
      NOW,
    );
    assert.match(reply, /לא מצאתי/);
    assert.match(reply, /בלי כוכבית/);
  });
});

describe("hebrew ASR כוכבית", () => {
  it("joins Whisper splits of כוכבית", () => {
    assert.equal(applyHebrewAsrSpellingFixes("כוכב ית מה יש לי היום"), "כוכבית מה יש לי היום");
    assert.equal(applyHebrewAsrSpellingFixes("כוחבית חלב"), "כוכבית חלב");
  });
});
