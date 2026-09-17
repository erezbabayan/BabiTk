import {
  incomingParseMetadata,
  parseIncomingMessage,
  parsedItemInsertFields,
  CONTEXT_PARSED_AT_KEY,
  type ParseIncomingOptions,
} from "../../../convex/lib/ingest/parseIncomingMessage";
import { DEFAULT_TAG_NAMES } from "../../../convex/lib/ingest/defaultTags";
import { needsVoiceTranscription } from "./voice-text";
import type { MindtaskerItem } from "../types";

export {
  incomingParseMetadata,
  parseIncomingMessage,
  parsedItemInsertFields,
  CONTEXT_PARSED_AT_KEY,
};

const RECENT_MS = 72 * 60 * 60 * 1000;

export function clientTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jerusalem";
  } catch {
    return "Asia/Jerusalem";
  }
}

export function resolveAllowedTagNames(names: string[] | null | undefined): string[] {
  const cleaned = (names ?? []).map((name) => name.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : DEFAULT_TAG_NAMES;
}

export function itemNeedsContextParse(item: Pick<
  MindtaskerItem,
  "title" | "content" | "tags" | "metadata" | "created_at"
>): boolean {
  const metadata = item.metadata;
  if (metadata && typeof metadata === "object" && CONTEXT_PARSED_AT_KEY in metadata) {
    return false;
  }
  if (needsVoiceTranscription(item.title, item.content)) {
    return false;
  }
  const text = `${item.title ?? ""}\n${item.content ?? ""}`.trim();
  if (!text) return false;
  const created = Date.parse(item.created_at);
  if (Number.isFinite(created) && Date.now() - created > RECENT_MS) {
    return false;
  }
  return true;
}

export function contextParsePatch(
  item: Pick<MindtaskerItem, "title" | "content" | "metadata">,
  allowedTags?: string[],
  now = new Date(),
): Partial<MindtaskerItem> | null {
  const parsed = parseIncomingMessage(`${item.title}\n${item.content}`, {
    allowedTags: resolveAllowedTagNames(allowedTags),
    timezone: clientTimezone(),
    now,
  } satisfies ParseIncomingOptions);
  const first = parsed[0];
  if (!first) return null;
  const fields = parsedItemInsertFields(first, {
    ...(typeof item.metadata === "object" && item.metadata ? item.metadata : {}),
  }, now);
  return {
    title: fields.title,
    content: fields.content,
    is_actionable: fields.is_actionable,
    due_date: fields.due_date,
    tags: fields.tags,
    metadata: fields.metadata,
  };
}
