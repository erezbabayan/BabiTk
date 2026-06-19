import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  getProfile,
  getWhatsAppStatus,
  requestPhoneVerification,
  verifyPhoneCode,
  type UsageSummary,
  type UserProfile,
  type WhatsAppProviderStatus,
} from "../lib/api";
import { ChannelInfoView } from "./ChannelInfoView";
import { WhatsAppProviderInfo } from "./WhatsAppProviderInfo";

interface PhoneLinkScreenProps {
  visible: boolean;
  summary: UsageSummary | null;
  onClose: () => void;
}

export function PhoneLinkScreen({ visible, summary, onClose }: PhoneLinkScreenProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"idle" | "verify">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [waStatus, setWaStatus] = useState<WhatsAppProviderStatus | null>(null);

  useEffect(() => {
    if (!visible) return;
    void getProfile()
      .then(setProfile)
      .catch(() => setProfile(null));
    void getWhatsAppStatus()
      .then(setWaStatus)
      .catch(() => setWaStatus(null));
  }, [visible]);

  if (!visible) return null;

  async function handleRequest() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await requestPhoneVerification(phone);
      setStep("verify");
      setMessage(result.devCode ? `${result.message}: ${result.devCode}` : result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    setLoading(true);
    setError(null);
    try {
      const result = await verifyPhoneCode(code);
      setProfile(result.profile);
      setStep("idle");
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.overlay}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.title}>קישור וואטסאפ</Text>
          <WhatsAppProviderInfo status={waStatus} />
          <ChannelInfoView channelId="whatsapp" summary={summary}>
          {profile?.phone_verified && profile.phone ? (
            <Text style={styles.ok}>מחובר: {profile.phone}</Text>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="+972501234567"
                placeholderTextColor="#94a3b8"
                value={step === "idle" ? phone : code}
                onChangeText={step === "idle" ? setPhone : setCode}
                keyboardType={step === "idle" ? "phone-pad" : "number-pad"}
              />
              <Pressable
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={() => void (step === "idle" ? handleRequest() : handleVerify())}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>
                    {step === "idle" ? "שלח קוד" : "אמת קוד"}
                  </Text>
                )}
              </Pressable>
            </>
          )}
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ChannelInfoView>
        <Pressable onPress={onClose} style={styles.close}>
          <Text style={styles.closeText}>סגור</Text>
        </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 24,
    zIndex: 100,
  },
  scrollContent: { flexGrow: 1, justifyContent: "center" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    maxHeight: "90%",
  },
  title: { fontSize: 18, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  ok: { color: "#047857", textAlign: "right", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#fff", fontWeight: "700" },
  message: { color: "#047857", marginTop: 8, textAlign: "right" },
  error: { color: "#dc2626", marginTop: 8, textAlign: "right" },
  close: { marginTop: 16, alignItems: "center" },
  closeText: { color: "#64748b" },
});
