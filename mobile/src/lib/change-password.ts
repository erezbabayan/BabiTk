import type { SupabaseClient } from "@supabase/supabase-js";

const MIN_PASSWORD_LENGTH = 8;

export async function changePasswordWithSupabase(
  supabase: SupabaseClient,
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error("הסיסמה החדשה חייבת להכיל לפחות 8 תווים");
  }

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
