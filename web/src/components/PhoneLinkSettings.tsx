import type { UsageSummary } from "../lib/api";
import { SupabasePhoneLinkSettings } from "./SupabasePhoneLinkSettings";

interface PhoneLinkSettingsProps {
  userId: string;
  summary: UsageSummary | null;
}

export function PhoneLinkSettings({ userId: _userId, summary }: PhoneLinkSettingsProps) {
  return <SupabasePhoneLinkSettings summary={summary} />;
}
