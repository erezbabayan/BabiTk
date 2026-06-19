import type { UsageSummary } from "../lib/api";
import { ChannelInfoPanel } from "./ChannelInfoPanel";

interface TextCaptureSettingsProps {
  summary: UsageSummary | null;
}

export function TextCaptureSettings({ summary }: TextCaptureSettingsProps) {
  return <ChannelInfoPanel channelId="text" summary={summary} />;
}
