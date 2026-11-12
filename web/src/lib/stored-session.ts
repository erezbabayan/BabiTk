/** Supabase persists the session under `sb-<ref>-auth-token` (localStorage or sessionStorage). */
export function hasStoredSupabaseSession(storages: Pick<Storage, "length" | "key">[]): boolean {
  for (const storage of storages) {
    try {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) return true;
      }
    } catch {
      // storage unavailable (privacy mode)
    }
  }
  return false;
}
