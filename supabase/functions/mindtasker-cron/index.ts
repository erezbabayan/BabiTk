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

function secretEquals(
  received: string | null | undefined,
  expected: string,
): boolean {
  if (!expected || typeof received !== "string") return false;
  const max = Math.max(received.length, expected.length);
  let mismatch = received.length === expected.length ? 0 : 1;
  for (let i = 0; i < max; i++) {
    mismatch |= (received.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

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

  const header = req.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : header;
  if (!secretEquals(token, CRON_SECRET)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const url = new URL(req.url);
  const job = url.searchParams.get("job") ?? "archive";

  if (job === "digest") {
    return trigger("/api/cron/daily-digest");
  }

  return trigger("/api/cron/archive-inbox");
});
