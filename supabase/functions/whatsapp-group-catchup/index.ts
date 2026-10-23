import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

import { matchesAnySecret } from "../_shared/safe-compare.ts";
import { withCronLease } from "../_shared/cron-lease.ts";
import { fetchGreenApiChatHistoryTexts, fetchGreenApiJournalTexts } from "../_shared/green-api-chats.ts";
import {
  GROUP_CATCHUP_CRON_LEASE,
  GROUP_CATCHUP_CRON_LEASE_TTL_SECONDS,
  runScheduledGroupCatchup,
} from "../_shared/whatsapp-group-catchup-cron.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET = Deno.env.get("GROUP_CATCHUP_CRON_SECRET")?.trim() ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function bearerToken(req: Request): string {
  const auth = req.headers.get("Authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!matchesAnySecret(bearerToken(req), [SERVICE_ROLE, CRON_SECRET])) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "missing_supabase_env" }, 500);
  let dryRun = false;
  try {
    const body = await req.json();
    dryRun = body && typeof body === "object" && (body as { dryRun?: unknown }).dryRun === true;
  } catch {
    // empty body = normal run
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const fetchers = { journal: fetchGreenApiJournalTexts, history: fetchGreenApiChatHistoryTexts };
  try {
    if (dryRun) return json(await runScheduledGroupCatchup(admin, fetchers, { dryRun: true }));
    return await withCronLease(
      admin,
      GROUP_CATCHUP_CRON_LEASE,
      GROUP_CATCHUP_CRON_LEASE_TTL_SECONDS,
      async () => json(await runScheduledGroupCatchup(admin, fetchers)),
      () => json({ ok: true, skipped: "busy", inserted: 0 }),
    );
  } catch (error) {
    console.error("group catchup failed", error instanceof Error ? error.message : error);
    return json({ ok: false, error: "catchup_failed" }, 500);
  }
});
