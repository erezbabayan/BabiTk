/**
 * Single-flight lease for cron-triggered dispatchers.
 *
 * pg_cron (every 5 min) and the GitHub Actions backup can both call
 * whatsapp-send-reminders. Every sender marks its slot only after delivery,
 * so two overlapping runs could send the same reminder twice. The lease
 * (public.try_acquire_cron_lease, atomic INSERT .. ON CONFLICT .. WHERE expired)
 * lets one cron run in at a time; a concurrent run returns "busy" and sends nothing.
 *
 * Fails open (status "unavailable") when the RPC is missing or errors, which is
 * exactly the behaviour before the lease existed.
 */

type RpcResult = { data: unknown; error: { message?: string; code?: string } | null };
export type LeaseAdmin = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
};

export const REMINDERS_CRON_LEASE = "whatsapp-send-reminders";
/** Longer than a normal run (~seconds), shorter than the 5-minute pg_cron cadence. */
export const REMINDERS_CRON_LEASE_TTL_SECONDS = 240;

export type CronLease =
  | { status: "acquired"; holder: string }
  | { status: "busy" }
  | { status: "unavailable" };

export async function acquireCronLease(
  admin: LeaseAdmin,
  name: string,
  ttlSeconds: number,
): Promise<CronLease> {
  try {
    const { data, error } = await admin.rpc("try_acquire_cron_lease", {
      p_name: name,
      p_ttl_seconds: ttlSeconds,
    });
    if (error) return { status: "unavailable" };
    if (typeof data === "string" && data.length > 0) return { status: "acquired", holder: data };
    return { status: "busy" };
  } catch {
    return { status: "unavailable" };
  }
}

export async function releaseCronLease(admin: LeaseAdmin, name: string, lease: CronLease): Promise<void> {
  if (lease.status !== "acquired") return;
  try {
    await admin.rpc("release_cron_lease", { p_name: name, p_holder: lease.holder });
  } catch {
    // The lease expires on its own after the TTL.
  }
}

/** Run `work` under the lease; returns `onBusy()` without running it when another run holds it. */
export async function withCronLease<T>(
  admin: LeaseAdmin,
  name: string,
  ttlSeconds: number,
  work: () => Promise<T>,
  onBusy: () => T,
): Promise<T> {
  const lease = await acquireCronLease(admin, name, ttlSeconds);
  if (lease.status === "busy") return onBusy();
  try {
    return await work();
  } finally {
    await releaseCronLease(admin, name, lease);
  }
}
