import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Account data export / deletion (same behavior as backend /api/profile/export and
 * DELETE /api/profile, which are not reachable from the GitHub Pages web or the APK).
 * POST { action: "export" | "delete" } with the user's Bearer JWT.
 */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SUPABASE_ANON || !SERVICE_ROLE) return json({ ok: false, error: "server" }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  if (userError || !userId) return json({ ok: false, error: "unauthorized" }, 401);

  const body = (await req.json().catch(() => ({}))) as { action?: unknown };
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (body.action === "export") {
    // Never put credentials or verification secrets into a downloadable file.
    const SECRET_PROFILE_KEYS = [
      "google_refresh_token",
      "phone_verify_hash",
      "phone_verify_expires_at",
      "phone_verify_attempts",
      "phone_verify_sent_at",
      "stripe_customer_id",
      "stripe_subscription_id",
    ];
    const [profile, items, tags, lessons, lists] = await Promise.all([
      admin.from("users").select("*").eq("id", userId).maybeSingle(),
      admin.from("mindtasker_items").select("*").eq("user_id", userId),
      admin.from("user_tags").select("*").eq("user_id", userId),
      admin.from("user_ingest_lessons").select("*").eq("user_id", userId),
      admin.from("task_lists").select("*").eq("user_id", userId),
    ]);
    return json({
      exported_at: new Date().toISOString(),
      profile: profile.data
        ? Object.fromEntries(
          Object.entries(profile.data as Record<string, unknown>).filter(
            ([key]) => !SECRET_PROFILE_KEYS.includes(key),
          ),
        )
        : null,
      items: items.data ?? [],
      tags: tags.data ?? [],
      lessons: lessons.data ?? [],
      task_lists: lists.data ?? [],
    });
  }

  if (body.action === "delete") {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return json({ ok: false, error: "delete_failed" }, 500);
    return json({ ok: true });
  }

  return json({ ok: false, error: "bad_action" }, 400);
});
