import type { SupabaseClient } from "@supabase/supabase-js";

const MIN_PASSWORD_LENGTH = 8;

function assertNewPassword(newPassword: string): void {
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error("הסיסמה החדשה חייבת להכיל לפחות 8 תווים");
  }
}

/** Set a password for a Google-only account that is already signed in. */
export async function setPasswordForSignedInUser(
  supabase: SupabaseClient,
  newPassword: string,
): Promise<void> {
  assertNewPassword(newPassword);
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function changePasswordWithSupabase(
  supabase: SupabaseClient,
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  assertNewPassword(newPassword);

  if (currentPassword === newPassword) {
    throw new Error("הסיסמה החדשה חייבת להיות שונה מהסיסמה הנוכחית");
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (signInError) {
    throw new Error("הסיסמה הנוכחית שגויה");
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (updateError) {
    throw updateError;
  }
}
