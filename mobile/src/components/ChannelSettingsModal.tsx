import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { UsageSummary } from "../lib/api";
import { CHANNELS } from "../lib/channel-info";
import { ChannelInfoView } from "./ChannelInfoView";

interface ChannelSettingsModalProps {
  visible: boolean;
  channelId: keyof typeof CHANNELS;
  summary: UsageSummary | null;
  onClose: () => void;
}

export function ChannelSettingsModal({
  visible,
  channelId,
  summary,
  onClose,
}: ChannelSettingsModalProps) {
  const channel = CHANNELS[channelId];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>
            {channel.icon} {channel.title}
          </Text>
          <ChannelInfoView channelId={channelId} summary={summary} />
          <Pressable style={styles.close} onPress={onClose}>
            <Text style={styles.closeText}>סגור</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    padding: 24,
  },
  sheet: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    maxHeight: "85%",
  },
  title: { fontSize: 18, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  close: { marginTop: 16, alignItems: "center" },
  closeText: { color: "#64748b", fontSize: 15 },
});
