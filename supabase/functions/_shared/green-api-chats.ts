/** List and match WhatsApp groups from Green-API for capture binding. */

export type GreenApiGroup = {
  chatId: string;
  name: string;
};

export function normalizeCaptureName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isPersonalCaptureLabel(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  return (
    trimmed.includes("הודעה לעצמי") ||
    lower.includes("babitk") ||
    lower.includes("message yourself")
  );
}

export function parseGroupChatId(value: string): string | null {
  const trimmed = value.trim();
  const match = trimmed.match(/([a-z0-9._-]{8,}@g\.us)/i);
  if (match?.[1]) return match[1].toLowerCase();
  return null;
}

export function pickMatchingGroup(
  groups: GreenApiGroup[],
  wanted: string,
): GreenApiGroup | null {
  const chatId = parseGroupChatId(wanted);
  if (chatId) {
    return groups.find((row) => row.chatId.toLowerCase() === chatId) ?? {
      chatId,
      name: wanted.trim(),
    };
  }
  const needle = normalizeCaptureName(wanted);
  if (!needle) return null;
  const exact = groups.find((row) => normalizeCaptureName(row.name) === needle);
  if (exact) return exact;
  const partials = groups
    .filter((row) => normalizeCaptureName(row.name).includes(needle))
    .sort((a, b) => a.name.length - b.name.length);
  return partials[0] ?? null;
}

export function mergeGreenApiGroups(groups: GreenApiGroup[]): GreenApiGroup[] {
  const out: GreenApiGroup[] = [];
  const seen = new Set<string>();
  for (const row of groups) {
    const chatId = row.chatId.trim().toLowerCase();
    if (!chatId.endsWith("@g.us") || seen.has(chatId)) continue;
    seen.add(chatId);
    const name = row.name.trim() || chatId;
    out.push({ chatId, name });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "he"));
  return out;
}

type RawChatRow = {
  id?: unknown;
  idMessage?: unknown;
  chatId?: unknown;
  name?: unknown;
  contactName?: unknown;
  chatName?: unknown;
  senderName?: unknown;
  type?: unknown;
  senderData?: unknown;
  textMessage?: unknown;
  caption?: unknown;
  text?: unknown;
  timestamp?: unknown;
  sendByApi?: unknown;
  isDeleted?: unknown;
  extendedTextMessage?: unknown;
};

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRows(data: unknown): RawChatRow[] {
  if (Array.isArray(data)) return data as RawChatRow[];
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  for (const key of ["messages", "data", "chats", "contacts"]) {
    if (Array.isArray(record[key])) return record[key] as RawChatRow[];
  }
  return [];
}

function nestedString(value: unknown, key: string): string {
  if (!value || typeof value !== "object") return "";
  return stringField((value as Record<string, unknown>)[key]);
}

export function collectGroupsFromUnknown(data: unknown): GreenApiGroup[] {
  const out: GreenApiGroup[] = [];
  for (const row of asRows(data)) {
    const sender = row.senderData;
    const rawId =
      stringField(row.id) ||
      stringField(row.chatId) ||
      nestedString(sender, "chatId") ||
      nestedString(sender, "chat_id");
    if (!rawId) continue;
    const chatId = rawId.includes("@") ? rawId.toLowerCase() : `${rawId}@c.us`;
    if (!chatId.endsWith("@g.us") && stringField(row.type) !== "group") continue;
    const groupId = chatId.endsWith("@g.us")
      ? chatId
      : `${rawId.replace(/@.*$/, "")}@g.us`;
    if (!groupId.endsWith("@g.us")) continue;
    out.push({
      chatId: groupId,
      name:
        stringField(row.name) ||
        stringField(row.contactName) ||
        stringField(row.chatName) ||
        nestedString(sender, "chatName") ||
        stringField(row.senderName) ||
        "קבוצה ללא שם",
    });
  }
  return mergeGreenApiGroups(out);
}

export function collectGroupsFromItemMetadata(
  rows: Array<{ title?: unknown; metadata?: unknown }>,
): GreenApiGroup[] {
  const out: GreenApiGroup[] = [];
  for (const row of rows) {
    const metadata =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null;
    const rawId = metadata
      ? stringField(metadata.chat_id) || stringField(metadata.chatId)
      : "";
    const chatId = parseGroupChatId(rawId);
    if (!chatId) continue;
    const title = stringField(row.title);
    out.push({
      chatId,
      name: title && !title.startsWith("…") ? title : chatId,
    });
  }
  return mergeGreenApiGroups(out);
}

export type GreenApiCreds = {
  instanceId: string;
  apiToken: string;
  apiUrl?: string;
};

export type GreenApiJournalText = {
  messageId: string;
  chatId: string;
  text: string;
  timestamp: number;
  chatName: string;
  outgoing: boolean;
};

function greenApiBase(apiUrl?: string): string {
  return (apiUrl?.trim() || "https://api.greenapi.com").replace(/\/$/, "");
}

function requireGreenApiCreds(input: GreenApiCreds): { instanceId: string; apiToken: string; base: string } {
  const instanceId = input.instanceId.trim();
  const apiToken = input.apiToken.trim();
  if (!instanceId || apiToken.length < 8) {
    throw new Error("Green-API לא מוגדר");
  }
  return { instanceId, apiToken, base: greenApiBase(input.apiUrl) };
}

function journalTextFromRow(row: RawChatRow): string {
  const extended =
    row.extendedTextMessage && typeof row.extendedTextMessage === "object"
      ? stringField((row.extendedTextMessage as Record<string, unknown>).text)
      : "";
  return (
    stringField(row.textMessage) ||
    stringField(row.caption) ||
    stringField(row.text) ||
    extended
  );
}

export function shouldCatchupCaptureText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (
    trimmed.startsWith("BabiTk") ||
    trimmed.startsWith("נפתחו ") ||
    trimmed.startsWith("קלטתי") ||
    trimmed.startsWith("נקלט ") ||
    trimmed.startsWith("לא הצלחתי")
  ) {
    return false;
  }
  if (
    /^(?:בבי[\s,:\-]|תפריט$|בוצע(?:\s+\d+)?$|דחה\b|מחר$|\*|עזרה$)/u.test(trimmed)
  ) {
    return false;
  }
  return true;
}

export function selectCatchupMessages(
  rows: GreenApiJournalText[],
  captureChatId: string | null,
  nowSec = Math.floor(Date.now() / 1000),
): GreenApiJournalText[] {
  const capture = captureChatId ? parseGroupChatId(captureChatId) : null;
  const oldest = nowSec - 7 * 24 * 60 * 60;
  const seen = new Set<string>();
  const out: GreenApiJournalText[] = [];
  for (const row of rows) {
    if (row.timestamp > 0 && row.timestamp < oldest) continue;
    if (!shouldCatchupCaptureText(row.text)) continue;
    if (capture) {
      if (row.chatId !== capture) continue;
    } else if (!row.outgoing) {
      continue;
    }
    if (seen.has(row.messageId)) continue;
    seen.add(row.messageId);
    out.push(row);
  }
  return out;
}

export function collectJournalTexts(
  data: unknown,
  fallbackChatId = "",
): GreenApiJournalText[] {
  const fallback = parseGroupChatId(fallbackChatId) ?? "";
  const out: GreenApiJournalText[] = [];
  const seen = new Set<string>();
  for (const row of asRows(data)) {
    if (row.sendByApi === true || row.isDeleted === true) continue;
    const sender = row.senderData;
    const rawId =
      stringField(row.chatId) ||
      nestedString(sender, "chatId") ||
      fallback;
    const chatId = parseGroupChatId(rawId);
    if (!chatId) continue;
    const text = journalTextFromRow(row);
    if (!shouldCatchupCaptureText(text)) continue;
    const messageId = stringField(row.idMessage);
    if (!messageId || seen.has(messageId)) continue;
    seen.add(messageId);
    const timestampRaw = row.timestamp;
    const timestamp =
      typeof timestampRaw === "number"
        ? timestampRaw
        : typeof timestampRaw === "string" && /^\d+$/.test(timestampRaw)
          ? Number(timestampRaw)
          : 0;
    out.push({
      messageId,
      chatId,
      text,
      timestamp,
      chatName:
        stringField(row.chatName) ||
        nestedString(sender, "chatName") ||
        stringField(row.name) ||
        "",
      outgoing: stringField(row.type).toLowerCase() === "outgoing",
    });
  }
  return out;
}

export async function fetchGreenApiJournalTexts(
  input: GreenApiCreds,
  minutes = 10080,
): Promise<GreenApiJournalText[]> {
  const { instanceId, apiToken, base } = requireGreenApiCreds(input);
  const urls = [
    `${base}/waInstance${instanceId}/lastOutgoingMessages/${apiToken}?minutes=${minutes}`,
    `${base}/waInstance${instanceId}/lastIncomingMessages/${apiToken}?minutes=${minutes}`,
  ];
  const rows: GreenApiJournalText[] = [];
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      rows.push(...collectJournalTexts(await response.json()));
    } catch {
      // browser CORS or transient Green-API errors
    }
  }
  return rows;
}

export async function fetchGreenApiChatHistoryTexts(
  input: GreenApiCreds,
  chatId: string,
  count = 80,
): Promise<GreenApiJournalText[]> {
  const groupId = parseGroupChatId(chatId);
  if (!groupId) return [];
  const { instanceId, apiToken, base } = requireGreenApiCreds(input);
  try {
    const response = await fetch(
      `${base}/waInstance${instanceId}/getChatHistory/${apiToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: groupId, count }),
      },
    );
    if (!response.ok) return [];
    return collectJournalTexts(await response.json(), groupId);
  } catch {
    return [];
  }
}

export async function fetchGreenApiGroups(input: GreenApiCreds): Promise<GreenApiGroup[]> {
  const instanceId = input.instanceId.trim();
  const apiToken = input.apiToken.trim();
  const base = (input.apiUrl?.trim() || "https://api.greenapi.com").replace(/\/$/, "");
  if (!instanceId || apiToken.length < 8) {
    throw new Error("Green-API לא מוגדר");
  }
  const urls = [
    `${base}/waInstance${instanceId}/getContacts/${apiToken}?group=true`,
    `${base}/waInstance${instanceId}/getChats/${apiToken}?count=500`,
    `${base}/waInstance${instanceId}/lastIncomingMessages/${apiToken}?minutes=10080`,
    `${base}/waInstance${instanceId}/lastOutgoingMessages/${apiToken}?minutes=10080`,
  ];
  const groups: GreenApiGroup[] = [];
  const errors: string[] = [];
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        errors.push(`Green-API ${response.status}`);
        continue;
      }
      groups.push(...collectGroupsFromUnknown(await response.json()));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  const merged = mergeGreenApiGroups(groups);
  if (merged.length === 0 && errors.length > 0) {
    throw new Error(errors[0] ?? "טעינת קבוצות נכשלה");
  }
  return merged;
}
