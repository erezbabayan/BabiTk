export type ConvexHealth =
  | { ok: true }
  | { ok: false; reason: "plan_disabled" | "unreachable" | "unknown"; detail?: string };

export function isConvexPlanLimitText(_text: string): boolean {
  return false;
}

export async function probeConvexHealth(
  _convexUrl: string,
  _timeoutMs = 8000,
): Promise<ConvexHealth> {
  return { ok: false, reason: "unknown", detail: "convex_removed" };
}

export function convexHealthMessage(_health: ConvexHealth): string {
  return "";
}

/** Boot: Supabase is the only cloud backend. */
export async function prepareRuntimeMode(): Promise<"cloud" | "local"> {
  return "cloud";
}
