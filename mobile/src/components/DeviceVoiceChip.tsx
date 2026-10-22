import { StyleSheet, Text } from "react-native";
import { DEVICE_VOICE_CHIP_LABEL } from "../lib/device-voice-chip";

export function DeviceVoiceChip() {
  return <Text style={styles.chip}>{DEVICE_VOICE_CHIP_LABEL}</Text>;
}

const styles = StyleSheet.create({
  chip: {
    flexShrink: 0,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    color: "#64748b",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 10,
    fontWeight: "500",
    lineHeight: 14,
  },
});
