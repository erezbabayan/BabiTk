/**
 * Supabase Edge Function — triggers backend cron via HTTP.
 * Deploy: supabase functions deploy mindtasker-cron
 * Schedule: Supabase Dashboard → Database → Cron → invoke this function
 *
 * Secrets: CRON_SECRET, BACKEND_URL (e.g. https://api.yourdomain.com)
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const BACKEND_URL = Deno.env.get("BACKEND_URL") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

async function trigger(path: string): Promise<Response> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  const body = await res.text();
  return new Response(body, { status: res.status });
}

Deno.serve(async (req) => {
  if (!BACKEND_URL || !CRON_SECRET) {
    return new Response(JSON.stringify({ error: "missing BACKEND_URL or CRON_SECRET" }), {
      status: 503,
    });
  }

  const url = new URL(req.url);
  const job = url.searchParams.get("job") ?? "archive";

  if (job === "digest") {
    return trigger("/api/cron/daily-digest");
  }

  return trigger("/api/cron/archive-inbox");
});
