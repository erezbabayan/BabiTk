import { StyleSheet, Text, View } from "react-native";
import type { WhatsAppProviderStatus } from "../lib/api";

interface WhatsAppProviderInfoProps {
  status: WhatsAppProviderStatus | null;
}

export function WhatsAppProviderInfo({ status }: WhatsAppProviderInfoProps) {
  if (!status) return null;

  return (
    <View
      style={[
        styles.box,
        status.configured ? styles.ok : styles.warn,
      ]}
    >
      <Text style={[styles.title, status.configured ? styles.okText : styles.warnText]}>
        ספק: {status.label}
      </Text>
      <Text style={[styles.body, status.configured ? styles.okText : styles.warnText]}>
        {status.configured
          ? "השרת מוכן לשלוח ולקבל הודעות בוואטסאפ."
          : status.setupHint ||
            "שליחת וואטסאפ עדיין לא מוגדרת — הרץ setup-whatsapp-green או הזן מפתחות API."}
      </Text>
      {status.provider !== "meta" ? (
        <Text style={[styles.mono, status.configured ? styles.okText : styles.warnText]}>
          Webhook: {status.inboundWebhookPath}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  ok: {
    borderColor: "#a7f3d0",
    backgroundColor: "#ecfdf5",
  },
  warn: {
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb",
  },
  title: { fontWeight: "700", textAlign: "right", fontSize: 14 },
  body: { marginTop: 4, textAlign: "right", fontSize: 12 },
  mono: { marginTop: 6, textAlign: "left", fontSize: 11 },
  okText: { color: "#065f46" },
  warnText: { color: "#92400e" },
});
