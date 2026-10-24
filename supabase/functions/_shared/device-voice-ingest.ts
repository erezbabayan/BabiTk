/**
 * Device-token voice ingest. Pure rules shared by the Edge function and tests.
 * The plaintext token is never stored; callers persist SHA-256 hex only.
 */

import { inferTagsFromText } from "./tag-inference.ts";
import { getZonedParts, zonedLocalToIso } from "./zoned-time.ts";

export const VOICE_INGEST_TIMEZONE = "Asia/Jerusalem";
export const VOICE_INGEST_HOURLY_LIMIT = 60;
export const VOICE_INGEST_WINDOW_MS = 60 * 60 * 1000;
export const VOICE_INGEST_DEFAULT_HOUR = 9;

const TITLE_MAX = 200;
const NOTES_MAX = 4000;
const LOCATION_MAX = 300;
const CLIENT_ID_MAX = 128;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;
const CLIENT_ID_RE = /^[A-Za-z0-9._:-]+$/;
export const VOICE_TAGS_MAX = 12;
export const VOICE_TAG_MAX_CHARS = 40;
const DEFAULT_TAG_COLOR = "#64748b";

export type VoiceItemType = "task" | "note";
export type VoiceBoard = "notebook" | "default";

export interface VoiceIngestInput {
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  notes: string;
  location: string | null;
  clientId: string | null;
  itemType: VoiceItemType;
  board: VoiceBoard;
  /** Requested tags (sanitized, not yet mapped to the user's tags). */
  tags: string[];
  /** True when the client sent `type` explicitly (title is always explicit). */
  typeExplicit: boolean;
}

export interface VoiceTag {
  name: string;
  color: string;
}

export interface DeviceTokenRecord {
  id: string;
  userId: string;
  revokedAt: string | null;
  requestTimestamps: string[];
}

export interface StoredVoiceTask {
  id: string;
  dueAt: string | null;
}

export interface VoiceIngestStore {
  findToken(tokenHash: string): Promise<DeviceTokenRecord | null>;
  findByClientId(userId: string, clientId: string): Promise<StoredVoiceTask | null>;
  saveRateLimit(tokenId: string, timestamps: string[], lastUsedAt: string): Promise<void>;
  touchToken(tokenId: string, lastUsedAt: string): Promise<void>;
  /** User's tag names (falls back to defaults when the user has none). */
  loadAllowedTagNames(userId: string): Promise<string[]>;
  /** User's tags with colors, in display order. */
  listTags(userId: string): Promise<VoiceTag[]>;
  insertTask(input: {
    userId: string;
    title: string;
    content: string;
    tags: string[];
    dueAt: string | null;
    isActionable: boolean;
    status: "inbox";
    metadata: Record<string, unknown>;
  }): Promise<StoredVoiceTask | { conflict: true }>;
}

export function voiceErrorBody(code: string, message: string): { ok: false; error: { code: string; message: string } } {
  return { ok: false, error: { code, message } };
}

export const VOICE_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Max-Age": "86400",
};

export function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...VOICE_CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

/**
 * Lenient: anything that is not an array of strings yields []. Never fails the
 * request, so older BabiSnap builds (no `tags`) keep working.
 */
export function sanitizeVoiceTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const name = value.trim().replace(/^#+/u, "").trim();
    if (!name || name.length > VOICE_TAG_MAX_CHARS) continue;
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= VOICE_TAGS_MAX) break;
  }
  return out;
}

/** Keep only tags the user has, using the user's canonical spelling. */
export function mapVoiceTagsToAllowed(requested: readonly string[], allowed: readonly string[]): string[] {
  const byKey = new Map<string, string>();
  for (const name of allowed) {
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (trimmed && !byKey.has(trimmed.toLocaleLowerCase())) byKey.set(trimmed.toLocaleLowerCase(), trimmed);
  }
  const out: string[] = [];
  for (const name of requested) {
    const hit = byKey.get(name.toLocaleLowerCase());
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out;
}

/**
 * Tags saved on a device voice item: the requested tags the user owns. When the
 * item is explicit (title + type) and none were sent, infer from the text so
 * auto-tagging still happens even though the client re-parse is skipped.
 */
export function resolveVoiceItemTags(input: {
  requested: readonly string[];
  allowed: readonly string[];
  explicit: boolean;
  text: string;
}): string[] {
  const mapped = mapVoiceTagsToAllowed(input.requested, input.allowed);
  if (mapped.length > 0 || !input.explicit || input.requested.length > 0) return mapped;
  try {
    return inferTagsFromText(input.text, [...input.allowed]);
  } catch {
    return [];
  }
}

export function normalizeVoiceTagList(rows: readonly { name?: unknown; color?: unknown }[]): VoiceTag[] {
  const out: VoiceTag[] = [];
  for (const row of rows) {
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!name) continue;
    const color = typeof row.color === "string" && row.color.trim() ? row.color.trim() : DEFAULT_TAG_COLOR;
    out.push({ name, color });
  }
  return out;
}

export function readBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  if (!match?.[1]) return null;
  const token = match[1];
  if (token.length < 24 || token.length > 200) return null;
  return token;
}

export async function hashDeviceToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function generateDeviceToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const body = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return `babi_${body}`;
}

function invalid(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

export function parseVoiceIngestBody(raw: unknown): { ok: true; value: VoiceIngestInput } | { ok: false; message: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return invalid("JSON object is required");
  }
  const body = raw as Record<string, unknown>;
  if (body.source !== undefined && body.source !== "voice") {
    return invalid("source must be voice");
  }
  if (typeof body.title !== "string" || body.title.trim().length === 0) {
    return invalid("title is required");
  }
  const title = body.title.trim();
  if (title.length > TITLE_MAX) return invalid("title is too long");

  let dueDate: string | null = null;
  if (body.due_date !== undefined && body.due_date !== null && body.due_date !== "") {
    if (typeof body.due_date !== "string" || !DATE_RE.test(body.due_date)) {
      return invalid("due_date must be YYYY-MM-DD");
    }
    const match = DATE_RE.exec(body.due_date)!;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!isRealDate(year, month, day)) return invalid("due_date is not a real date");
    dueDate = body.due_date;
  }

  let dueTime: string | null = null;
  if (body.due_time !== undefined && body.due_time !== null && body.due_time !== "") {
    if (typeof body.due_time !== "string" || !TIME_RE.test(body.due_time)) {
      return invalid("due_time must be HH:MM");
    }
    const match = TIME_RE.exec(body.due_time)!;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return invalid("due_time must be HH:MM");
    dueTime = `${match[1]}:${match[2]}`;
  }

  let notes = "";
  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== "string") return invalid("notes must be a string");
    notes = body.notes.trim();
    if (notes.length > NOTES_MAX) return invalid("notes is too long");
  }

  let location: string | null = null;
  if (body.location !== undefined && body.location !== null && body.location !== "") {
    if (typeof body.location !== "string") return invalid("location must be a string");
    location = body.location.trim();
    if (location.length === 0) location = null;
    else if (location.length > LOCATION_MAX) return invalid("location is too long");
  }

  let clientId: string | null = null;
  if (body.client_id !== undefined && body.client_id !== null && body.client_id !== "") {
    if (typeof body.client_id !== "string" || !CLIENT_ID_RE.test(body.client_id) || body.client_id.length > CLIENT_ID_MAX) {
      return invalid("client_id must be 1-128 letters, digits, dot, underscore, colon, or dash");
    }
    clientId = body.client_id;
  }

  const itemType = readChoice(body.type, ["task", "note"], "task", "type must be task or note");
  if (typeof itemType !== "string") return itemType;
  const board = readChoice(body.board, ["notebook", "default"], "default", "board must be notebook or default");
  if (typeof board !== "string") return board;

  return {
    ok: true,
    value: {
      title,
      dueDate,
      dueTime,
      notes,
      location,
      clientId,
      itemType,
      board,
      tags: sanitizeVoiceTags(body.tags),
      typeExplicit: body.type === "task" || body.type === "note",
    },
  };
}

function readChoice<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  message: string,
): T | { ok: false; message: string } {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  return invalid(message);
}

/**
 * מחברת is the inbox column (`status: inbox`), which is also where voice
 * ingest already lands. `board: default` keeps that column. `board: notebook`
 * is the same column, named for BabiSnap. Task vs note is only `is_actionable`.
 * Due dates are applied by the caller for both types.
 */
const VOICE_BOARD_STATUS: Record<VoiceBoard, "inbox"> = {
  default: "inbox",
  notebook: "inbox",
};

export function voiceItemPlacement(input: {
  itemType: VoiceItemType;
  board: VoiceBoard;
}): { status: "inbox"; isActionable: boolean } {
  return {
    status: VOICE_BOARD_STATUS[input.board],
    isActionable: input.itemType === "task",
  };
}

/** Jerusalem local date + clock. Date-only defaults to 09:00. Time-only uses today. */
export function voiceDueAt(
  dueDate: string | null,
  dueTime: string | null,
  now = new Date(),
): string | null {
  if (!dueDate && !dueTime) return null;
  const today = getZonedParts(now, VOICE_INGEST_TIMEZONE);
  const date = dueDate ?? `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
  const match = DATE_RE.exec(date);
  if (!match) return null;
  const time = dueTime ?? `${String(VOICE_INGEST_DEFAULT_HOUR).padStart(2, "0")}:00`;
  const timeMatch = TIME_RE.exec(time);
  if (!timeMatch) return null;
  return zonedLocalToIso(
    {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(timeMatch[1]),
      minute: Number(timeMatch[2]),
    },
    VOICE_INGEST_TIMEZONE,
  );
}

export function voiceTaskContent(notes: string, location: string | null): string {
  const parts: string[] = [];
  if (notes.trim()) parts.push(notes.trim());
  if (location?.trim()) parts.push(`מיקום: ${location.trim()}`);
  return parts.join("\n");
}

export function voiceTaskMetadata(input: {
  clientId: string | null;
  location: string | null;
  dueAt: string | null;
  /** Explicit title + type: clients must not re-parse title/type. */
  explicit?: boolean;
  now?: Date;
}): Record<string, unknown> {
  const metadata: Record<string, unknown> = { source: "voice", channel: "voice" };
  if (input.explicit) {
    metadata.voice_explicit = true;
    // Marks the item as already parsed so the web/mobile context re-parse
    // (normalizeTaskPresentation, note->task) never rewrites it.
    metadata.context_parsed_at = (input.now ?? new Date()).toISOString();
  }
  if (input.clientId) metadata.voice_client_id = input.clientId;
  if (input.location) metadata.location = input.location;
  if (input.dueAt) {
    metadata.reminder_manual = true;
    metadata.reminder_sent = false;
    metadata.reminder_disabled = false;
    metadata.analysis = { target_at: input.dueAt, notify_at: input.dueAt };
  }
  return metadata;
}

export function applyVoiceRateLimit(
  timestamps: readonly string[],
  now = new Date(),
  limit = VOICE_INGEST_HOURLY_LIMIT,
): { allowed: boolean; kept: string[] } {
  const cutoff = now.getTime() - VOICE_INGEST_WINDOW_MS;
  const kept = timestamps.filter((iso) => {
    const sent = Date.parse(iso);
    return Number.isFinite(sent) && sent > cutoff;
  });
  if (kept.length >= limit) return { allowed: false, kept };
  kept.push(now.toISOString());
  return { allowed: true, kept };
}

export async function handleVoiceIngest(
  request: Request,
  store: VoiceIngestStore,
  now = new Date(),
): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: VOICE_CORS_HEADERS });
  if (request.method !== "POST" && request.method !== "GET") {
    return jsonResponse(voiceErrorBody("method_not_allowed", "GET or POST is required"), 405);
  }

  const token = readBearerToken(request.headers.get("Authorization"));
  if (!token) {
    return jsonResponse(voiceErrorBody("unauthorized", "invalid token"), 401);
  }

  if (request.method === "GET") {
    const device = await store.findToken(await hashDeviceToken(token));
    if (!device || device.revokedAt) {
      return jsonResponse(voiceErrorBody("unauthorized", "invalid token"), 401);
    }
    const limit = applyVoiceRateLimit(device.requestTimestamps, now);
    if (!limit.allowed) {
      return jsonResponse(voiceErrorBody("rate_limited", "at most 60 requests per hour for this device"), 429);
    }
    await store.saveRateLimit(device.id, limit.kept, now.toISOString());
    const tags = normalizeVoiceTagList(await store.listTags(device.userId));
    return jsonResponse({ tags }, 200);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(voiceErrorBody("invalid_json", "request body must be JSON"), 400);
  }
  const parsed = parseVoiceIngestBody(payload);
  if (!parsed.ok) {
    return jsonResponse(voiceErrorBody("validation", parsed.message), 400);
  }

  const tokenHash = await hashDeviceToken(token);
  const device = await store.findToken(tokenHash);
  if (!device || device.revokedAt) {
    return jsonResponse(voiceErrorBody("unauthorized", "invalid token"), 401);
  }

  const placement = voiceItemPlacement({
    itemType: parsed.value.itemType,
    board: parsed.value.board,
  });
  const dueAt = voiceDueAt(parsed.value.dueDate, parsed.value.dueTime, now);
  if (parsed.value.clientId) {
    const existing = await store.findByClientId(device.userId, parsed.value.clientId);
    if (existing) {
      await store.touchToken(device.id, now.toISOString());
      return jsonResponse({ ok: true, task_id: existing.id, due_at: existing.dueAt }, 201);
    }
  }

  const limit = applyVoiceRateLimit(device.requestTimestamps, now);
  if (!limit.allowed) {
    return jsonResponse(voiceErrorBody("rate_limited", "at most 60 tasks per hour for this device"), 429);
  }
  await store.saveRateLimit(device.id, limit.kept, now.toISOString());

  const content = voiceTaskContent(parsed.value.notes, parsed.value.location);
  const explicit = parsed.value.typeExplicit;
  let tags: string[] = [];
  if (parsed.value.tags.length > 0 || explicit) {
    try {
      const allowed = await store.loadAllowedTagNames(device.userId);
      tags = resolveVoiceItemTags({
        requested: parsed.value.tags,
        allowed,
        explicit,
        text: `${parsed.value.title}\n${parsed.value.notes}`,
      });
    } catch {
      tags = [];
    }
  }

  const inserted = await store.insertTask({
    userId: device.userId,
    title: parsed.value.title,
    content,
    tags,
    dueAt,
    isActionable: placement.isActionable,
    status: placement.status,
    metadata: voiceTaskMetadata({
      clientId: parsed.value.clientId,
      location: parsed.value.location,
      dueAt,
      explicit,
      now,
    }),
  });
  if ("conflict" in inserted) {
    const existing = parsed.value.clientId
      ? await store.findByClientId(device.userId, parsed.value.clientId)
      : null;
    if (!existing) {
      return jsonResponse(voiceErrorBody("server", "could not create task"), 500);
    }
    return jsonResponse({ ok: true, task_id: existing.id, due_at: existing.dueAt }, 201);
  }
  return jsonResponse({ ok: true, task_id: inserted.id, due_at: inserted.dueAt }, 201);
}
