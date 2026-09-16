import { looksLikeEmail, normalizeLoginIdentifier } from "./login-aliases";
import { requireSupabase } from "./supabase";

export async function resolveLoginEmail(identifier: string): Promise<string> {
  const normalized = normalizeLoginIdentifier(identifier);
  if (!normalized) {
    throw new Error("יש להזין שם משתמש או אימייל");
  }
  if (looksLikeEmail(normalized)) {
    return normalized;
  }

  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("resolve_login_email", {
    identifier: normalized,
  });
  if (error) {
    throw new Error("לא ניתן לאמת את שם המשתמש. נסו שוב או השתמשו באימייל.");
  }
  if (typeof data === "string" && looksLikeEmail(data)) {
    return data.trim().toLowerCase();
  }
  throw new Error("שם משתמש לא נמצא. בדקו את האיות או הירשמו.");
}
