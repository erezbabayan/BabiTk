/** Probe whether the Convex deployment answers (plan disabled / network). */

export type ConvexHealth =
  | { ok: true }
  | { ok: false; reason: "plan_disabled" | "unreachable" | "unknown"; detail?: string };

export async function probeConvexHealth(
  convexUrl: string,
  timeoutMs = 8000,
): Promise<ConvexHealth> {
  const base = convexUrl.replace(/\/$/, "");
  if (!base) return { ok: false, reason: "unknown", detail: "missing_url" };

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Any HTTP response means the host is up; body often explains plan limits.
    const response = await fetch(`${base}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "health:ping", args: {}, format: "json" }),
      signal: controller.signal,
    });
    const text = await response.text().catch(() => "");
    const lower = text.toLowerCase();
    if (
      lower.includes("free plan limits") ||
      lower.includes("deployments have been disabled") ||
      lower.includes("exceeded the free plan")
    ) {
      return { ok: false, reason: "plan_disabled", detail: text.slice(0, 200) };
    }
    // 4xx/5xx on health still means we reached Convex — treat as reachable unless plan text.
    if (response.ok || response.status === 400 || response.status === 401) {
      return { ok: true };
    }
    return { ok: false, reason: "unknown", detail: `${response.status} ${text.slice(0, 120)}` };
  } catch {
    return { ok: false, reason: "unreachable" };
  } finally {
    window.clearTimeout(timer);
  }
}

export function convexHealthMessage(health: ConvexHealth): string {
  if (health.ok) return "";
  if (health.reason === "plan_disabled") {
    return "שרת Convex חסום — חרגתם ממגבלת תוכנית Free. יש לשדרג ל־Pro ב־dashboard.convex.dev כדי שהמערכת תחזור.";
  }
  if (health.reason === "unreachable") {
    return "אין חיבור לשרת Convex. בדקו אינטרנט או נסו שוב בעוד דקה.";
  }
  return "שרת Convex לא זמין כרגע. נסו שוב מאוחר יותר.";
}
