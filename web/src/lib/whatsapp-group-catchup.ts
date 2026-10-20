import { parseGroupChatId } from "../../../supabase/functions/_shared/green-api-chats.ts";
import { requireSupabase } from "./supabase";
import {
  getCloudUserProfile,
  updateCloudUserProfile,
} from "./user-profile";
import {
  isPersonalCaptureLabel,
  resolveCaptureGroup,
} from "./whatsapp-capture-groups";
import { currentAccessToken, currentUserId, invokeGreenConnect } from "./whatsapp-gateway";
import {
  liveCaptureGateBlocksGroup,
  personalCaptureRepairPatch,
} from "./whatsapp-live-capture-gate";

export type WhatsAppCatchupResult = {
  boundChatId: string | null;
  scanned: number;
  inserted: number;
  needsGroupPost: boolean;
  repairedGate: boolean;
};

let catchupInFlight: Promise<WhatsAppCatchupResult> | null = null;

async function existingWhatsAppMessageIds(userId: string): Promise<Set<string>> {
  const supabase = requireSupabase();
  const { data } = await supabase
    .from("mindtasker_items")
    .select("metadata")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(400);
  const ids = new Set<string>();
  for (const row of data ?? []) {
    const metadata =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null;
    const id =
      metadata && typeof metadata.whatsapp_message_id === "string"
        ? metadata.whatsapp_message_id.trim()
        : "";
    if (id) ids.add(id);
  }
  return ids;
}

async function repairLiveCaptureGateIfNeeded(): Promise<boolean> {
  const profile = await getCloudUserProfile();
  if (!liveCaptureGateBlocksGroup(profile)) return false;
  await updateCloudUserProfile({
    ...personalCaptureRepairPatch(profile),
    notify_whatsapp_group: true,
  });
  return true;
}

async function bindCaptureGroupIfNeeded(): Promise<string | null> {
  const profile = await getCloudUserProfile();
  const existing = parseGroupChatId(profile.whatsapp_capture_group_chat_id ?? "");
  if (existing) return existing;
  const savedName = profile.whatsapp_capture_group_name?.trim() ?? "";
  if (!savedName || isPersonalCaptureLabel(savedName)) return null;
  try {
    const matched = await resolveCaptureGroup(savedName);
    if (!matched.chatId.endsWith("@g.us")) return null;
    await updateCloudUserProfile({
      whatsapp_capture_group_name: matched.name,
      whatsapp_capture_group_chat_id: matched.chatId,
      notify_whatsapp_group: true,
    });
    return matched.chatId;
  } catch {
    return null;
  }
}

async function catchUpViaConnectAction(): Promise<WhatsAppCatchupResult | null> {
  const accessToken = await currentAccessToken();
  if (!accessToken) return null;
  const supabase = requireSupabase();
  const { data, error } = await supabase.functions.invoke("whatsapp-green-connect", {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { action: "catchupInbox" },
  });
  if (error || !data || typeof data !== "object") return null;
  const row = data as {
    catchup?: unknown;
    boundChatId?: unknown;
    scanned?: unknown;
    inserted?: unknown;
  };
  if (row.catchup !== true) return null;
  const boundChatId = typeof row.boundChatId === "string" ? row.boundChatId : null;
  return {
    boundChatId,
    scanned: typeof row.scanned === "number" ? row.scanned : 0,
    inserted: typeof row.inserted === "number" ? row.inserted : 0,
    needsGroupPost: !boundChatId,
    repairedGate: false,
  };
}

async function catchUpWhatsAppGroupInboxOnce(): Promise<WhatsAppCatchupResult> {
  const empty: WhatsAppCatchupResult = {
    boundChatId: null,
    scanned: 0,
    inserted: 0,
    needsGroupPost: true,
    repairedGate: false,
  };
  const userId = await currentUserId();
  if (!userId) return empty;

  const repairedGate = await repairLiveCaptureGateIfNeeded();
  const viaConnect = await catchUpViaConnectAction();
  if (viaConnect) {
    return { ...viaConnect, repairedGate: repairedGate || viaConnect.repairedGate };
  }

  const boundBefore = await bindCaptureGroupIfNeeded();
  const knownBefore = await existingWhatsAppMessageIds(userId);
  try {
    await invokeGreenConnect("status");
  } catch {
    // live connect may be unauthorized; profile repair still unblocks the webhook
  }
  const profile = await getCloudUserProfile();
  const boundChatId =
    parseGroupChatId(profile.whatsapp_capture_group_chat_id ?? "") ?? boundBefore;
  const knownAfter = await existingWhatsAppMessageIds(userId);
  let inserted = 0;
  for (const id of knownAfter) {
    if (!knownBefore.has(id)) inserted += 1;
  }
  return {
    boundChatId,
    scanned: knownAfter.size,
    inserted,
    needsGroupPost: !boundChatId,
    repairedGate,
  };
}

export async function catchUpWhatsAppGroupInbox(): Promise<WhatsAppCatchupResult> {
  if (catchupInFlight) return await catchupInFlight;
  catchupInFlight = catchUpWhatsAppGroupInboxOnce().finally(() => {
    catchupInFlight = null;
  });
  return await catchupInFlight;
}
