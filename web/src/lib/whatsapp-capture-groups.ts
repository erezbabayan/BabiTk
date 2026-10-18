import { requireSupabase } from "./supabase";
import {
  collectGroupsFromItemMetadata,
  collectGroupsFromUnknown,
  fetchGreenApiGroups,
  isPersonalCaptureLabel,
  mergeGreenApiGroups,
  parseGroupChatId,
  pickMatchingGroup,
  type GreenApiGroup,
} from "../../../supabase/functions/_shared/green-api-chats.ts";
import { currentAccessToken, currentUserId } from "./whatsapp-gateway";

export type { GreenApiGroup };
export { isPersonalCaptureLabel, parseGroupChatId, pickMatchingGroup };

async function listGroupsViaConnect(): Promise<GreenApiGroup[]> {
  const accessToken = await currentAccessToken();
  if (!accessToken) return [];
  const supabase = requireSupabase();
  const { data, error } = await supabase.functions.invoke("whatsapp-green-connect", {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { action: "listGroups" },
  });
  if (error || !data || typeof data !== "object") return [];
  return collectGroupsFromUnknown((data as { groups?: unknown }).groups);
}

async function listGroupsViaGateway(): Promise<GreenApiGroup[]> {
  const supabase = requireSupabase();
  const userId = await currentUserId();
  if (!userId) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("whatsapp_gateways")
    .select("instance_id,api_token,api_url")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const instanceId =
    data && typeof data.instance_id === "string" ? data.instance_id : "";
  const apiToken = data && typeof data.api_token === "string" ? data.api_token : "";
  const apiUrl = data && typeof data.api_url === "string" ? data.api_url : "";
  return await fetchGreenApiGroups({ instanceId, apiToken, apiUrl });
}

async function listGroupsViaItems(): Promise<GreenApiGroup[]> {
  const supabase = requireSupabase();
  const userId = await currentUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("mindtasker_items")
    .select("title, metadata")
    .eq("user_id", userId)
    .filter("metadata->>chat_id", "like", "%@g.us")
    .limit(80);
  if (error || !data) return [];
  return collectGroupsFromItemMetadata(data);
}

export async function listCaptureGroups(): Promise<GreenApiGroup[]> {
  const buckets = await Promise.allSettled([
    listGroupsViaConnect(),
    listGroupsViaGateway(),
    listGroupsViaItems(),
  ]);
  const collected: GreenApiGroup[] = [];
  for (const result of buckets) {
    if (result.status === "fulfilled") collected.push(...result.value);
  }
  return mergeGreenApiGroups(collected);
}

export async function resolveCaptureGroup(
  wanted: string,
): Promise<GreenApiGroup> {
  const direct = parseGroupChatId(wanted);
  let groups: GreenApiGroup[] = [];
  let listed = false;
  try {
    groups = await listCaptureGroups();
    listed = true;
  } catch {
    if (direct) return { chatId: direct, name: wanted.trim() };
    throw new Error(
      "לא הצלחתי לטעון את רשימת הקבוצות. הדביקו מזהה שמסתיים ב-@g.us",
    );
  }
  const match = pickMatchingGroup(groups, wanted);
  if (match) return match;
  if (direct) return { chatId: direct, name: wanted.trim() };
  throw new Error(
    listed && groups.length === 0
      ? "לא נמצאו קבוצות בחיבור הוואטסאפ. הדביקו מזהה שמסתיים ב-@g.us"
      : "לא מצאתי קבוצה בשם הזה. בחרו מהרשימה או הדביקו מזהה שמסתיים ב-@g.us",
  );
}
