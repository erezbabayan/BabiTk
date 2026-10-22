import { requireSupabase } from "./supabase";
import { parseBabisnapResponse, type BabisnapStatus } from "../../../convex/lib/babisnap";

export async function babisnapAction(action: "status" | "connect" | "disconnect"): Promise<BabisnapStatus> {
  const supabase = requireSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("unauthorized");
  const { data, error } = await supabase.functions.invoke("babisnap", {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { action },
  });
  if (error) throw new Error("server");
  return parseBabisnapResponse(data);
}
