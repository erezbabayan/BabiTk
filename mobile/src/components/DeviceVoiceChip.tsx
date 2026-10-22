import { Image, StyleSheet, Text, View } from "react-native";

import logo from "../../assets/babisnap-logo.webp";
import { DEVICE_VOICE_CHIP_LABEL } from "../lib/device-voice-chip";

export function DeviceVoiceChip() {
  return (
    <View style={styles.chip}>
      <Image source={logo} style={styles.logo} />
      <Text style={styles.label}>{DEVICE_VOICE_CHIP_LABEL}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    direction: "ltr",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  logo: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  label: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "500",
    lineHeight: 14,
  },
});
