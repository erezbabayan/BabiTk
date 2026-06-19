import type { UsageSummary } from "../lib/api";
import { ChannelInfoPanel } from "./ChannelInfoPanel";

interface VoiceRecordingSettingsProps {
  summary: UsageSummary | null;
}

export function VoiceRecordingSettings({ summary }: VoiceRecordingSettingsProps) {
  return <ChannelInfoPanel channelId="voice" summary={summary} />;
}
