import { useState } from "react";
import { Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { createBillingPortal, createCheckoutSession } from "../lib/api";
import type { UsageSummary } from "../lib/api";

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

  const isAudio = code === "audio_quota";
  const title = code
    ? isAudio
      ? "מכסת תמלול אזלה"
      : "מכסת AI אזלה"
    : "BabiTk Premium";

  const description = code
    ? isAudio
      ? "הגעת למכסת דקות התמלול החודשית בחשבון החינמי."
      : "הגעת למכסת ניתוחי ה-AI החודשית בחשבון החינמי."
    : "מכסות בלתי מוגבלות ל-AI, תמלול ו-OCR — בלי הגבלות חודשיות.";

  async function openBillingUrl(url: string) {
    if (url.startsWith("mindtasker://")) {
      onUpgraded?.(url);
      onClose();
      return;
    }
    await Linking.openURL(url);
    onClose();
  }

  async function handleUpgrade() {
    setLoading(true);
    setError(null);
    try {
      const url = await createCheckoutSession("mobile");
      await openBillingUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בפתיחת תשלום");
    } finally {
      setLoading(false);
    }
  }

  async function handleManage() {
    setLoading(true);
    setError(null);
    try {
      const url = await createBillingPortal();
      await openBillingUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בניהול מנוי");
    } finally {
      setLoading(false);
    }
  }

  const isPremium = summary?.isPremium;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{description}</Text>

          {summary && !summary.isPremium ? (
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
                onPress={() => void handleUpgrade()}
                disabled={loading}
              >
                <Text style={styles.buttonText}>{loading ? "..." : "שדרג ל-Premium"}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={() => void handleManage()}
                disabled={loading}
              >
                <Text style={styles.buttonText}>{loading ? "..." : "ניהול מנוי"}</Text>
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
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
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
