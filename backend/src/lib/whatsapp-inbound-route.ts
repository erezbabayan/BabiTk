/**
 * Hard split for WhatsApp group messages.
 *
 * Capture and Q&A never share a code path after this classifier:
 *   - capture: new task/note. No briefing, no tag load, no Q&A send.
 *   - question/help: wake word בבי / * / ? only. Never inserts an item.
 *   - menu / menu_pick / command: control messages, also never insert.
 *
 * Classify is sync and has no I/O so a spoken task cannot get stuck behind
 * a board query.
 */

import { parseWhatsAppCommand } from "./whatsapp-commands.js";
import { isBareWhatsAppMenuPick, isWhatsAppMenuRequest } from "./whatsapp-query.js";
import {
  isWhatsAppCaptureDictate,
  normalizeSpokenWhatsAppQuestion,
  parseWhatsAppInboundQuestion,
} from "./whatsapp-system-question.js";

export type WhatsAppInboundLane =
  | "capture"
  | "question"
  | "help"
  | "menu"
  | "menu_pick"
  | "command";

export type WhatsAppInboundRoute =
  | { lane: "capture" }
  | { lane: "help" }
  | { lane: "question"; question: string }
  | { lane: "menu" }
  | { lane: "menu_pick" }
  | { lane: "command" };

export function classifyWhatsAppInbound(text: string): WhatsAppInboundRoute {
  const raw = text.trim();
  if (!raw) return { lane: "capture" };

  if (isWhatsAppCaptureDictate(raw)) return { lane: "capture" };

  const spoken = normalizeSpokenWhatsAppQuestion(raw);
  const spokenOrRaw = spoken || raw;

  if (parseWhatsAppCommand(raw) || parseWhatsAppCommand(spokenOrRaw)) {
    return { lane: "command" };
  }

  if (isBareWhatsAppMenuPick(raw) || isBareWhatsAppMenuPick(spokenOrRaw)) {
    return { lane: "menu_pick" };
  }

  if (isWhatsAppMenuRequest(raw) || isWhatsAppMenuRequest(spokenOrRaw)) {
    return { lane: "menu" };
  }

  const parsed = parseWhatsAppInboundQuestion(raw);
  if (parsed.kind === "help") return { lane: "help" };
  if (parsed.kind === "question") {
    return { lane: "question", question: parsed.question };
  }

  return { lane: "capture" };
}

export function isWhatsAppCaptureLane(text: string): boolean {
  return classifyWhatsAppInbound(text).lane === "capture";
}

export function isWhatsAppQuestionLane(text: string): boolean {
  const { lane } = classifyWhatsAppInbound(text);
  return lane === "question" || lane === "help";
}
