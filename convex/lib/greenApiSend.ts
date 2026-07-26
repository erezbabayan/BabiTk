import { normalizePhone } from "./phone";

export type GreenApiCredentials = {
  instanceId: string;
  token: string;
  baseUrl: string;
};

function digitsOnly(phone: string): string {
  return normalizePhone(phone).replace(/\D/g, "");
}

export function greenApiCredentialsFromEnv(): GreenApiCredentials | null {
  const instanceId = process.env.GREEN_API_INSTANCE_ID?.trim();
  const token = process.env.GREEN_API_TOKEN?.trim();
  if (!instanceId || !token) return null;
  return {
    instanceId,
    token,
    baseUrl: (process.env.GREEN_API_URL ?? "https://api.greenapi.com").replace(/\/$/, ""),
  };
}

export function isGreenApiSendConfigured(
  credentials?: GreenApiCredentials | null,
): boolean {
  if (credentials?.instanceId && credentials.token) return true;
  return greenApiCredentialsFromEnv() !== null;
}

function resolveChatId(toPhoneOrChatId: string): string {
  const raw = toPhoneOrChatId.trim();
  if (raw.includes("@")) return raw;
  return `${digitsOnly(raw)}@c.us`;
}

/** Linked WhatsApp phone digits for this Green-API instance (empty if unknown). */
export async function fetchGreenApiSenderDigits(
  credentials?: GreenApiCredentials | null,
): Promise<string> {
  const creds = credentials ?? greenApiCredentialsFromEnv();
  if (!creds) return "";
  const baseUrl = creds.baseUrl.replace(/\/$/, "");
  const url = `${baseUrl}/waInstance${creds.instanceId}/getWaSettings/${creds.token}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return "";
    const data = (await response.json()) as { phone?: string };
    return data.phone ? digitsOnly(data.phone) : "";
  } catch {
    return "";
  }
}

/** Instance state from getStateInstance (e.g. authorized, yellowCard, notAuthorized). */
export async function fetchGreenApiInstanceState(
  credentials?: GreenApiCredentials | null,
): Promise<string | null> {
  const creds = credentials ?? greenApiCredentialsFromEnv();
  if (!creds) return null;
  const baseUrl = creds.baseUrl.replace(/\/$/, "");
  const url = `${baseUrl}/waInstance${creds.instanceId}/getStateInstance/${creds.token}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = (await response.json()) as { stateInstance?: string };
    return data.stateInstance?.trim() || null;
  } catch {
    return null;
  }
}

export type GreenApiRestriction = {
  state: string | null;
  /** True when WhatsApp has limited the linked account (yellowCard / suspended / blocked). */
  restricted: boolean;
  /** Unix seconds when yellowCard is expected to lift (if provided by Green-API). */
  yellowCardUntil: number | null;
};

export function isGreenApiRestrictedState(state: string | null | undefined): boolean {
  const s = (state ?? "").trim().toLowerCase();
  return s === "yellowcard" || s === "suspended" || s === "blocked";
}

/** Combined state + yellowCardUntil — used to pause outbound and explain capture outages. */
export async function fetchGreenApiRestriction(
  credentials?: GreenApiCredentials | null,
): Promise<GreenApiRestriction> {
  const creds = credentials ?? greenApiCredentialsFromEnv();
  if (!creds) {
    return { state: null, restricted: false, yellowCardUntil: null };
  }
  const baseUrl = creds.baseUrl.replace(/\/$/, "");
  try {
    const [stateRes, waRes] = await Promise.all([
      fetch(`${baseUrl}/waInstance${creds.instanceId}/getStateInstance/${creds.token}`),
      fetch(`${baseUrl}/waInstance${creds.instanceId}/getWaSettings/${creds.token}`),
    ]);
    const stateBody = (await stateRes.json().catch(() => ({}))) as {
      stateInstance?: string;
    };
    const waBody = (await waRes.json().catch(() => ({}))) as {
      stateInstance?: string;
      yellowCardUntil?: number;
    };
    const state =
      stateBody.stateInstance?.trim() || waBody.stateInstance?.trim() || null;
    const until =
      typeof waBody.yellowCardUntil === "number" && waBody.yellowCardUntil > 0
        ? waBody.yellowCardUntil
        : null;
    return {
      state,
      restricted: isGreenApiRestrictedState(state),
      yellowCardUntil: until,
    };
  } catch {
    return { state: null, restricted: false, yellowCardUntil: null };
  }
}

/** True when Green-API would send from the same number it is messaging (silent self-chat). */
export function isGreenApiSelfSend(
  senderDigits: string,
  toPhoneOrChatId: string,
): boolean {
  if (!senderDigits) return false;
  const target = toPhoneOrChatId.trim();
  if (target.includes("@g.us")) return false;
  const toDigits = digitsOnly(target.includes("@") ? target.split("@")[0]! : target);
  return toDigits.length > 0 && toDigits === senderDigits;
}

/** Send outbound WhatsApp text via Green-API (phone or full chatId). */
export async function sendGreenApiText(
  toPhoneOrChatId: string,
  body: string,
  credentials?: GreenApiCredentials | null,
): Promise<void> {
  const creds = credentials ?? greenApiCredentialsFromEnv();
  if (!creds) {
    throw new Error("Green-API send is not configured (GREEN_API_INSTANCE_ID / GREEN_API_TOKEN)");
  }

  // Never hammer WhatsApp while the account is restricted — that prolongs yellowCard
  // and is the main reason capture webhooks stop working for days.
  const restriction = await fetchGreenApiRestriction(creds);
  if (restriction.restricted) {
    const until = restriction.yellowCardUntil
      ? new Date(restriction.yellowCardUntil * 1000).toISOString().slice(0, 10)
      : "unknown";
    throw new Error(
      `green_api_restricted:${restriction.state ?? "unknown"}:until:${until}`,
    );
  }

  const baseUrl = creds.baseUrl.replace(/\/$/, "");
  const url = `${baseUrl}/waInstance${creds.instanceId}/sendMessage/${creds.token}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chatId: resolveChatId(toPhoneOrChatId),
      message: body,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Green-API send failed: ${response.status} ${detail}`.trim());
  }
}

/**
 * Mark an inbound WhatsApp message as read (double blue ticks for the sender).
 * No-op if credentials missing; never throws to the caller.
 */
export async function markGreenApiMessageRead(
  chatId: string,
  idMessage?: string,
  credentials?: GreenApiCredentials | null,
): Promise<boolean> {
  const creds = credentials ?? greenApiCredentialsFromEnv();
  if (!creds || !chatId.trim()) return false;

  const baseUrl = creds.baseUrl.replace(/\/$/, "");
  const url = `${baseUrl}/waInstance${creds.instanceId}/readChat/${creds.token}`;
  const body: { chatId: string; idMessage?: string } = {
    chatId: resolveChatId(chatId),
  };
  if (idMessage?.trim()) {
    body.idMessage = idMessage.trim();
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export const BABITK_CAPTURE_GROUP_NAME = "babiTK";

/** Case-insensitive match for the default capture group name. */
export function isBabiTkGroupName(name: string | null | undefined): boolean {
  return (name ?? "").trim().toLowerCase() === BABITK_CAPTURE_GROUP_NAME.toLowerCase();
}

export type GreenApiCreateGroupResult = {
  created: boolean;
  chatId: string;
  groupInviteLink?: string;
};

/**
 * Create a WhatsApp group via Green-API.
 * The instance account becomes admin; `participantChatIds` are additional members.
 */
export async function createGreenApiGroup(
  groupName: string,
  participantChatIds: string[],
  credentials?: GreenApiCredentials | null,
): Promise<GreenApiCreateGroupResult> {
  const creds = credentials ?? greenApiCredentialsFromEnv();
  if (!creds) {
    throw new Error("Green-API לא מוגדר (Instance ID / Token)");
  }

  const chatIds = participantChatIds
    .map((id) => resolveChatId(id))
    .filter((id, index, all) => id.length > 0 && all.indexOf(id) === index);

  if (chatIds.length === 0) {
    throw new Error("נדרש לפחות משתתף אחד ליצירת הקבוצה");
  }

  const baseUrl = creds.baseUrl.replace(/\/$/, "");
  const url = `${baseUrl}/waInstance${creds.instanceId}/createGroup/${creds.token}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      groupName: groupName.trim().slice(0, 100) || BABITK_CAPTURE_GROUP_NAME,
      chatIds,
    }),
  });

  const detail = await response.text().catch(() => "");
  if (!response.ok) {
    if (response.status === 423) {
      throw new Error(
        "חיבור הוואטסאפ מוגבל (yellowCard) — אי אפשר ליצור קבוצה דרך ה-API. צרו את הקבוצה בוואטסאפ ושלחו שם הודעה לחיבור.",
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "Green-API לא מורשה ליצור קבוצות כרגע. צרו את הקבוצה בוואטסאפ וחברו אותה מההגדרות.",
      );
    }
    throw new Error(
      `יצירת קבוצה נכשלה: ${response.status} ${detail}`.trim(),
    );
  }

  let data: {
    created?: boolean;
    chatId?: string;
    groupInviteLink?: string;
  };
  try {
    data = JSON.parse(detail) as typeof data;
  } catch {
    throw new Error("תשובת Green-API ליצירת קבוצה אינה תקינה");
  }

  const chatId = data.chatId?.trim();
  if (!chatId) {
    throw new Error("Green-API לא החזיר מזהה קבוצה");
  }

  return {
    created: data.created !== false,
    chatId,
    groupInviteLink: data.groupInviteLink?.trim() || undefined,
  };
}

export type GreenApiChatRow = {
  chatId: string;
  name: string;
  kind: "group" | "personal";
};

/**
 * List WhatsApp chats (prefer groups) for capture-target picker.
 * Merges getContacts?group=true and getChats so names like «משימות» are found.
 */
export async function fetchGreenApiCaptureChats(
  credentials?: GreenApiCredentials | null,
): Promise<GreenApiChatRow[]> {
  const creds = credentials ?? greenApiCredentialsFromEnv();
  if (!creds) {
    throw new Error("Green-API לא מוגדר");
  }

  const baseUrl = creds.baseUrl.replace(/\/$/, "");
  const contactsUrl = `${baseUrl}/waInstance${creds.instanceId}/getContacts/${creds.token}?group=true`;
  const chatsUrl = `${baseUrl}/waInstance${creds.instanceId}/getChats/${creds.token}?count=500`;

  type RawRow = {
    id?: string;
    chatId?: string;
    name?: string;
    contactName?: string;
    type?: string;
  };

  async function load(url: string): Promise<RawRow[]> {
    const response = await fetch(url);
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Green-API list failed: ${response.status} ${detail}`.trim());
    }
    const data: unknown = await response.json();
    return Array.isArray(data) ? (data as RawRow[]) : [];
  }

  const rows: RawRow[] = [];
  const errors: string[] = [];
  for (const url of [contactsUrl, chatsUrl]) {
    try {
      rows.push(...(await load(url)));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (rows.length === 0 && errors.length > 0) {
    throw new Error(errors[0] ?? "טעינת קבוצות נכשלה");
  }

  const out: GreenApiChatRow[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const rawId = (row.id ?? row.chatId ?? "").trim();
    if (!rawId) continue;
    const chatId = resolveChatId(rawId);
    if (seen.has(chatId)) continue;
    const isGroup = chatId.endsWith("@g.us") || row.type === "group";
    if (!isGroup) continue;
    seen.add(chatId);
    const name =
      row.name?.trim() ||
      row.contactName?.trim() ||
      "קבוצה ללא שם";
    out.push({ chatId, name, kind: "group" });
  }

  out.sort((a, b) => a.name.localeCompare(b.name, "he"));
  return out;
}
