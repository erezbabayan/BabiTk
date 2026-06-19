import { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { UsageSummary } from "../lib/api";
import {
  CHANNELS,
  formatAiUsage,
  formatAudioUsage,
  type ChannelInfo,
} from "../lib/channel-info";

interface ChannelInfoViewProps {
  channelId: keyof typeof CHANNELS;
  summary?: UsageSummary | null;
  children?: ReactNode;
}

function LimitsBlock({
  channel,
  summary,
}: {
  channel: ChannelInfo;
  summary?: UsageSummary | null;
}) {
  const liveRows =
    summary && !summary.isPremium
      ? [
          ...(channel.id === "voice" || channel.id === "whatsapp"
            ? [{ label: "מכסת תמלול (נוכחית)", value: formatAudioUsage(summary) }]
            : []),
          { label: "מכסת AI (נוכחית)", value: formatAiUsage(summary) },
        ]
      : summary?.isPremium
        ? [{ label: "מנוי", value: "Premium — ללא הגבלת מכסה" }]
        : [];

  return (
    <View style={styles.limitsBox}>
      <Text style={styles.limitsTitle}>מגבלות ומכסות</Text>
      {channel.limits.map((row) => (
        <View key={row.label} style={styles.limitRow}>
          <Text style={styles.limitLabel}>{row.label}</Text>
          <Text style={styles.limitValue}>{row.value}</Text>
        </View>
      ))}
      {liveRows.map((row) => (
        <View key={row.label} style={styles.limitRow}>
          <Text style={styles.limitLabelLive}>{row.label}</Text>
          <Text style={styles.limitValueLive}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

export function ChannelInfoView({ channelId, summary, children }: ChannelInfoViewProps) {
  const channel = CHANNELS[channelId];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.description}>{channel.description}</Text>
      <Text style={styles.platforms}>זמין ב: {channel.platforms}</Text>

      {children}

      <LimitsBlock channel={channel} summary={summary} />

      {channel.notes?.map((note) => (
        <Text key={note} style={styles.note}>
          • {note}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 8 },
  description: { fontSize: 14, color: "#475569", textAlign: "right", lineHeight: 20 },
  platforms: { fontSize: 12, color: "#94a3b8", textAlign: "right", marginTop: 4, marginBottom: 12 },
  limitsBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    marginTop: 12,
    marginBottom: 8,
  },
  limitsTitle: { fontSize: 14, fontWeight: "700", color: "#1e293b", textAlign: "right", marginBottom: 8 },
  limitRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6,
  },
  limitLabel: { fontSize: 13, color: "#64748b", flexShrink: 0 },
  limitValue: { fontSize: 13, color: "#334155", textAlign: "left", flex: 1 },
  limitLabelLive: { fontSize: 13, color: "#475569", fontWeight: "600", flexShrink: 0 },
  limitValueLive: { fontSize: 13, color: "#1e293b", fontWeight: "600", textAlign: "left", flex: 1 },
  note: { fontSize: 12, color: "#94a3b8", textAlign: "right", marginTop: 4, lineHeight: 18 },
});
