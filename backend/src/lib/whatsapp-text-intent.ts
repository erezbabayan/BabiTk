import { parseWhatsAppCommand } from "./whatsapp-commands.js";
import {
  isSystemWhatsAppReply,
  isWhatsAppMenuRequest,
  parseWhatsAppQuery,
  type WhatsAppQuery,
} from "./whatsapp-query.js";
import {
  parseWhatsAppSystemQuestion,
  type SystemQuestionParse,
} from "./whatsapp-system-question.js";
import type { WhatsAppCommandAction } from "./whatsapp-commands.js";

export type ResolvedWhatsAppIntent =
  | { type: "skip" }
  | { type: "menu" }
  | { type: "query"; query: WhatsAppQuery; fallbackSearch: string | null }
  | { type: "search"; parsed: SystemQuestionParse }
  | { type: "command"; command: WhatsAppCommandAction }
  | { type: "ingest" };

export function resolveWhatsAppTextIntent(
  raw: string,
  allowedTags: string[] = [],
): ResolvedWhatsAppIntent {
  const text = raw.trim();
  if (!text || isSystemWhatsAppReply(text)) return { type: "skip" };

  const systemQuestion = parseWhatsAppSystemQuestion(text);
  const intentText =
    systemQuestion.kind === "question" ? systemQuestion.question : text;
  const prefixed = systemQuestion.kind !== "none";

  if (
    systemQuestion.kind === "help" ||
    isWhatsAppMenuRequest(intentText) ||
    isWhatsAppMenuRequest(text)
  ) {
    return { type: "menu" };
  }

  const command = parseWhatsAppCommand(text);
  if (command && !prefixed) {
    const asQuery = parseWhatsAppQuery(intentText, allowedTags);
    if (!asQuery) return { type: "command", command };
  }

  const query = parseWhatsAppQuery(intentText, allowedTags);
  if (query) {
    return {
      type: "query",
      query,
      fallbackSearch: prefixed ? intentText : null,
    };
  }

  if (prefixed && systemQuestion.kind === "question") {
    return { type: "search", parsed: systemQuestion };
  }
  if (prefixed && systemQuestion.kind === "help") {
    return { type: "menu" };
  }

  return { type: "ingest" };
}
