import { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { setSubscriptionTier, type UsageSummary } from "../lib/api";

interface PaywallModalProps {
  visible: boolean;
  code: "audio_quota" | "ai_parse_quota" | null;
  summary: UsageSummary | null;
  onClose: () => void;
  onUpgraded?: (returnUrl?: string) => void;
}

export function PaywallModal({ visible, code, summary, onClose, onUpgraded }: PaywallModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setError(null);
      setLoading(false);
    }
  }, [visible]);

  const isAudio = code === "audio_quota";
  const isPremium = summary?.isPremium === true;
  const title = code
    ? isAudio
      ? "מכסת תמלול אזלה"
      : "מכסת AI אזלה"
    : "ניהול מנוי";

  const description = code
    ? isAudio
      ? "הגעת למכסת דקות התמלול החודשית בחשבון הרגיל."
      : "הגעת למכסת ניתוחי ה-AI החודשית בחשבון הרגיל."
    : "בחרו חשבון רגיל או Premium. ניהול משתמשים אחרים יתווסף למנהל המערכת בהמשך.";

  async function changeTier(tier: "free" | "premium") {
    setLoading(true);
    setError(null);
    try {
      await setSubscriptionTier(tier);
      onUpgraded?.(tier === "free" ? "mindtasker://home?billing=cancel" : "mindtasker://home?billing=success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא ניתן לעדכן את המנוי");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{description}</Text>

          {summary && !isPremium ? (
            <View style={styles.stats}>
              <Text style={styles.stat}>
                ניתוחי AI: {summary.aiParses.used} / {summary.aiParses.allocated}
              </Text>
              <Text style={styles.stat}>
                תמלול: {summary.audio.used}s / {summary.audio.allocated}s
              </Text>
            </View>
          ) : null}

          {isPremium ? (
            <Text style={styles.premiumNote}>יש לך מנוי Premium פעיל.</Text>
          ) : (
            <View style={styles.benefits}>
              <Text style={styles.benefit}>• ניתוחי AI ללא הגבלה</Text>
              <Text style={styles.benefit}>• תמלול קולי ללא הגבלה</Text>
              <Text style={styles.benefit}>• OCR מחברות ללא הגבלה</Text>
            </View>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryText}>סגור</Text>
            </TouchableOpacity>
            {!isPremium ? (
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={() => void changeTier("premium")}
                disabled={loading}
              >
                <Text style={styles.buttonText}>{loading ? "..." : "שדרג ל-Premium"}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.manageButton, loading && styles.buttonDisabled]}
                onPress={() => void changeTier("free")}
                disabled={loading}
              >
                <Text style={styles.manageText}>{loading ? "..." : "מעבר לחשבון רגיל"}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
  },
  title: { fontSize: 20, fontWeight: "800", color: "#0f172a", textAlign: "right" },
  body: { marginTop: 8, fontSize: 14, color: "#475569", textAlign: "right", lineHeight: 20 },
  stats: {
    marginTop: 12,
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  stat: { fontSize: 13, color: "#334155", textAlign: "right" },
  premiumNote: { marginTop: 12, fontSize: 14, color: "#047857", textAlign: "right" },
  benefits: { marginTop: 12, gap: 4 },
  benefit: { fontSize: 13, color: "#475569", textAlign: "right" },
  error: { marginTop: 8, fontSize: 13, color: "#dc2626", textAlign: "right" },
  actions: { marginTop: 16, flexDirection: "row-reverse", gap: 8 },
  button: {
    flex: 1,
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  manageButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  manageText: { color: "#334155", fontWeight: "700", fontSize: 15 },
  secondaryButton: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
  },
  secondaryText: { color: "#475569", fontWeight: "600" },
});
