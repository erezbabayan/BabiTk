import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

import {
  ADMIN_READ_FIELDS,
  adminReadJson,
  handleAdminRead,
  type AdminReadStore,
} from "../_shared/admin-read.ts";
import { createMemorySnapRateLimiter } from "../_shared/snap-users.ts";

// Read-only listing for the Babi Admin site (server-to-server).
// verify_jwt stays false; the handler checks `x-babi-admin-key` against
// BABI_ADMIN_READ_KEY (constant time) and fails closed when it is unset.
// The service role stays inside this function and is never returned.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BABI_ADMIN_READ_KEY = Deno.env.get("BABI_ADMIN_READ_KEY") ?? "";

const limiter = createMemorySnapRateLimiter();
const AUTH_PAGE = 1000;

Deno.serve(async (req) => {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return adminReadJson({ ok: false, error: "missing server configuration" }, 500);
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const store: AdminReadStore = {
    async list(resource, { limit, offset }) {
      if (resource === "tk_users") {
        const items: Array<Record<string, unknown>> = [];
        let page = Math.floor(offset / AUTH_PAGE) + 1;
        let skip = offset % AUTH_PAGE;
        let total: number | undefined;
        while (items.length < limit) {
          const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: AUTH_PAGE });
          if (error) throw new Error(error.message);
          const users = data?.users ?? [];
          const t = (data as { total?: unknown } | null)?.total;
          if (typeof t === "number") total = t;
          for (const u of users.slice(skip)) {
            if (items.length >= limit) break;
            items.push({
              id: u.id,
              email: u.email ?? null,
              created_at: u.created_at ?? null,
              last_sign_in_at: u.last_sign_in_at ?? null,
            });
          }
          if (users.length < AUTH_PAGE) break;
          page += 1;
          skip = 0;
        }
        return { items, total };
      }
      const orderBy = resource === "snap_users" ? "last_seen" : "created_at";
      const { data, error, count } = await supabase
        .from(resource)
        .select(ADMIN_READ_FIELDS[resource].join(", "), { count: "exact" })
        .order(orderBy, { ascending: false })
        .order("id", { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) throw new Error(error.message);
      return {
        items: (data ?? []) as unknown as Array<Record<string, unknown>>,
        total: typeof count === "number" ? count : undefined,
      };
    },
  };
  try {
    return await handleAdminRead(req, { key: BABI_ADMIN_READ_KEY, store, limiter });
  } catch (err) {
    console.error("admin-read error", err instanceof Error ? err.message : err);
    return adminReadJson({ ok: false, error: "server error" }, 500);
  }
});
