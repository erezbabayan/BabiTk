import { getSupabaseAdmin } from "../lib/supabase.js";

export const ALLOWED_INBOX_ARCHIVE_HOURS = [48, 72, 168, 720] as const;
export type InboxArchiveHours = (typeof ALLOWED_INBOX_ARCHIVE_HOURS)[number];
export const DEFAULT_INBOX_ARCHIVE_HOURS: InboxArchiveHours = 48;

export interface BoardSettings {
  inbox_archive_hours: InboxArchiveHours;
}

export function isValidInboxArchiveHours(hours: number): hours is InboxArchiveHours {
  return (ALLOWED_INBOX_ARCHIVE_HOURS as readonly number[]).includes(hours);
}

export async function getBoardSettings(userId: string): Promise<BoardSettings> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("inbox_archive_hours")
    .eq("id", userId)
    .single();

  if (error || !data) {
    throw new Error(`Board settings not found: ${error?.message ?? userId}`);
  }

  const hours = data.inbox_archive_hours ?? DEFAULT_INBOX_ARCHIVE_HOURS;
  return {
    inbox_archive_hours: isValidInboxArchiveHours(hours) ? hours : DEFAULT_INBOX_ARCHIVE_HOURS,
  };
}

export async function updateBoardSettings(
  userId: string,
  patch: Partial<BoardSettings>,
): Promise<BoardSettings> {
  if (
    patch.inbox_archive_hours !== undefined &&
    !isValidInboxArchiveHours(patch.inbox_archive_hours)
  ) {
    throw new Error("Invalid inbox archive period");
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("users")
    .update({
      ...(patch.inbox_archive_hours !== undefined
        ? { inbox_archive_hours: patch.inbox_archive_hours }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    throw new Error(`Failed to update board settings: ${error.message}`);
  }

  return getBoardSettings(userId);
}
