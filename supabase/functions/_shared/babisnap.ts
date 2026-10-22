/**
 * BabiSnap device-token rules. Only rows named BabiSnap are rotated.
 * Other device names, including a Raspberry Pi token, stay as they are.
 * The plaintext token is returned once by the caller and is never logged here.
 */

import { generateDeviceToken, hashDeviceToken } from "./device-voice-ingest.ts";

export const BABISNAP_NAME = "BabiSnap";

export interface DeviceTokenRow {
  userId: string;
  name: string;
  tokenHash: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface BabisnapStore {
  tokensForUser(userId: string): Promise<DeviceTokenRow[]>;
  replaceBabisnap(userId: string, tokenHash: string): Promise<void>;
  disconnectBabisnap(userId: string): Promise<void>;
}

export function babisnapView(rows: readonly DeviceTokenRow[]): {
  connected: boolean;
  lastUsedAt: string | null;
} {
  const active = rows.filter((row) => row.name === BABISNAP_NAME && row.revokedAt == null);
  if (active.length === 0) return { connected: false, lastUsedAt: null };
  const used = active
    .map((row) => row.lastUsedAt)
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .sort();
  return { connected: true, lastUsedAt: used.at(-1) ?? null };
}

export async function performBabisnapAction(
  action: string,
  userId: string,
  store: BabisnapStore,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (action !== "status" && action !== "connect" && action !== "disconnect") {
    return { status: 400, body: { ok: false, error: "validation" } };
  }

  if (action === "connect") {
    const token = generateDeviceToken();
    const tokenHash = await hashDeviceToken(token);
    await store.replaceBabisnap(userId, tokenHash);
    return {
      status: 200,
      body: { ok: true, connected: true, last_used_at: null, token },
    };
  }

  if (action === "disconnect") {
    await store.disconnectBabisnap(userId);
  }

  const view = babisnapView(await store.tokensForUser(userId));
  return {
    status: 200,
    body: { ok: true, connected: view.connected, last_used_at: view.lastUsedAt },
  };
}
