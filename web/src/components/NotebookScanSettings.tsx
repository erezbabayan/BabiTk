import type { UsageSummary } from "../lib/api";
import { ChannelInfoPanel } from "./ChannelInfoPanel";

interface NotebookScanSettingsProps {
  summary: UsageSummary | null;
}

export function NotebookScanSettings({ summary }: NotebookScanSettingsProps) {
  return <ChannelInfoPanel channelId="notebook" summary={summary} />;
}
