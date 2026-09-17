import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  clearWhatsAppGateway,
  invokeGreenConnect,
  loadWhatsAppGateway,
  saveWhatsAppGateway,
  type GreenConnectAction,
  type GreenConnectStatus,
} from "../lib/whatsapp-gateway";
import { formatPairingCode, WHATSAPP_PAIRING_HINT, WHATSAPP_SCAN_HINT } from "../lib/whatsapp-pairing";

const GREEN_CONSOLE = "https://console.green-api.com/";

type ConnectMethod = "phone" | "qr";

interface GreenApiConnectSettingsProps {
  onLinked?: () => void;
}

export function GreenApiConnectSettings({ onLinked }: GreenApiConnectSettingsProps) {
  const [status, setStatus] = useState<GreenConnectStatus | null>(null);
  const [instanceId, setInstanceId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [showKeys, setShowKeys] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [method, setMethod] = useState<ConnectMethod>("phone");
  const [phone, setPhone] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  async function refreshStatus(
    action: GreenConnectAction = "status",
    extra?: { phone?: string },
  ): Promise<GreenConnectStatus | null> {
    const next = await invokeGreenConnect(action, extra);
    setStatus(next);
    if (next.instanceId) setInstanceId(next.instanceId);
    if (next.configured) setShowKeys(false);
    if (next.pairingCode) setPairingCode(next.pairingCode);
    if (next.authorized) {
      setPairingCode(null);
      onLinked?.();
    }
    return next;
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const row = await loadWhatsAppGateway();
        if (cancelled) return;
        if (row) setInstanceId(row.instance_id);
        let next = await refreshStatus(row ? "configureWebhook" : "status");
        if (cancelled) return;
        if (!row && next?.canAutoProvision && !next.configured) {
          next = await refreshStatus("ensureInstance");
          if (cancelled) return;
        }
        if (!row && !next?.configured && !next?.canAutoProvision) {
          setShowKeys(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "טעינת חיבור הוואטסאפ נכשלה");
          setShowKeys(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!status?.configured || status.authorized) return;
    const timer = setInterval(() => {
      void refreshStatus("status").catch(() => undefined);
    }, 4000);
    return () => clearInterval(timer);
  }, [status?.configured, status?.authorized]);

  async function handleSaveKeys() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await saveWhatsAppGateway({ instanceId, apiToken });
      setApiToken("");
      await refreshStatus("configureWebhook");
      setMessage("נשמר. הזינו מספר לקבלת קוד חיבור.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירת החיבור נכשלה");
    } finally {
      setSaving(false);
    }
  }

  async function handlePairing() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const next = await refreshStatus("pairingCode", { phone });
      if (next?.pairingCode) {
        setPairingCode(next.pairingCode);
        setMessage("הזינו את הקוד בוואטסאפ. אחרי החיבור תתקבל הודעת אישור.");
      } else if (!next?.authorized) {
        setError(next?.hint || "לא הצלחנו להפיק קוד.");
        if (!next?.configured) setShowKeys(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "בקשת קוד החיבור נכשלה");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setSaving(true);
    setError(null);
    try {
      await clearWhatsAppGateway();
      setStatus(null);
      setPairingCode(null);
      setShowKeys(false);
      setMessage("חיבור הוואטסאפ נותק.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ניתוק נכשל");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <ActivityIndicator color="#047857" />;
  }

  const connected = Boolean(status?.authorized);
  const showConnect = !connected;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>חיבור וואטסאפ</Text>
      <Text style={styles.hint}>
        הזינו מספר וקבלו קוד — בלי סריקה. במחשב אפשר גם לסרוק QR. אחרי החיבור תישלח הודעת אישור.
      </Text>

      {connected ? (
        <View style={styles.okBox}>
          <Text style={styles.okTitle}>הוואטסאפ מחובר</Text>
          {status?.linkedPhone ? (
            <Text style={styles.okPhone}>{status.linkedPhone}</Text>
          ) : null}
          <Text style={styles.hint}>{status?.hint}</Text>
          <Pressable onPress={() => void handleDisconnect()} disabled={saving}>
            <Text style={styles.link}>נתק</Text>
          </Pressable>
        </View>
      ) : null}

      {showConnect ? (
        <View style={styles.waitBox}>
          <View style={styles.tabs}>
            <Pressable
              style={[styles.tab, method === "phone" && styles.tabActive]}
              onPress={() => setMethod("phone")}
            >
              <Text style={[styles.tabText, method === "phone" && styles.tabTextActive]}>
                קוד בטלפון
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tab, method === "qr" && styles.tabActive]}
              onPress={() => setMethod("qr")}
            >
              <Text style={[styles.tabText, method === "qr" && styles.tabTextActive]}>QR</Text>
            </Pressable>
          </View>

          {method === "phone" ? (
            <>
              <Text style={styles.waitTitle}>חברו עם מספר</Text>
              <Text style={styles.hint}>{WHATSAPP_PAIRING_HINT}</Text>
              <TextInput
                style={styles.input}
                placeholder="0501234567"
                placeholderTextColor="#94a3b8"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
              <Pressable
                style={[styles.button, (saving || !phone.trim()) && styles.buttonDisabled]}
                onPress={() => void handlePairing()}
                disabled={saving || !phone.trim()}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>{pairingCode ? "חדש קוד" : "שלח קוד חיבור"}</Text>
                )}
              </Pressable>
              {pairingCode ? (
                <View style={styles.codeBox}>
                  <Text style={styles.codeLabel}>הקוד להזנה בוואטסאפ</Text>
                  <Text style={styles.code}>{formatPairingCode(pairingCode)}</Text>
                  <Text style={styles.hint}>
                    וואטסאפ → הגדרות → מכשירים מקושרים → קישור מכשיר → קישור עם מספר טלפון
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.waitTitle}>סריקה במכשיר אחר</Text>
              <Text style={styles.hint}>{WHATSAPP_SCAN_HINT}</Text>
              {status?.qrBase64 ? (
                <Image
                  accessibilityLabel="QR לחיבור וואטסאפ"
                  source={{ uri: `data:image/png;base64,${status.qrBase64}` }}
                  style={styles.qr}
                />
              ) : (
                <Text style={styles.hint}>
                  {status?.configured
                    ? "טוען QR..."
                    : "אם אין QR, השלימו קודם את ההגדרה החד-פעמית למטה."}
                </Text>
              )}
            </>
          )}
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      {showKeys ? (
        <View style={styles.keysBox}>
          <Text style={styles.waitTitle}>הגדרה טכנית מוסתרת</Text>
          <Text style={styles.hint}>
            נדרש רק אם החיבור הפשוט לא זמין. המפתחות לא מוצגים במסלול הרגיל.
          </Text>
          <Pressable onPress={() => void Linking.openURL(GREEN_CONSOLE)}>
            <Text style={styles.link}>פתחו את GREEN-API</Text>
          </Pressable>
          <TextInput
            style={styles.input}
            placeholder="Instance ID"
            placeholderTextColor="#94a3b8"
            value={instanceId}
            onChangeText={setInstanceId}
            keyboardType="number-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="API Token"
            placeholderTextColor="#94a3b8"
            value={apiToken}
            onChangeText={setApiToken}
            secureTextEntry
            autoCapitalize="none"
          />
          <Pressable
            style={[styles.button, saving && styles.buttonDisabled]}
            onPress={() => void handleSaveKeys()}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>שמור והמשך לחיבור</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setShowKeys(true)}>
          <Text style={styles.link}>הגדרה טכנית מוסתרת</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 12,
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    textAlign: "right",
    color: "#0f172a",
  },
  hint: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "right",
    lineHeight: 18,
  },
  okBox: {
    borderWidth: 1,
    borderColor: "#6ee7b7",
    backgroundColor: "#ecfdf5",
    borderRadius: 12,
    padding: 12,
  },
  okTitle: {
    fontWeight: "700",
    color: "#064e3b",
    textAlign: "right",
  },
  okPhone: {
    marginTop: 4,
    color: "#047857",
    textAlign: "left",
  },
  waitBox: {
    borderWidth: 1,
    borderColor: "#fcd34d",
    backgroundColor: "#fffbeb",
    borderRadius: 12,
    padding: 12,
  },
  waitTitle: {
    marginTop: 8,
    fontWeight: "700",
    color: "#78350f",
    textAlign: "right",
  },
  tabs: {
    flexDirection: "row-reverse",
    gap: 8,
  },
  tab: {
    borderRadius: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tabActive: {
    backgroundColor: "#78350f",
  },
  tabText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#78350f",
  },
  tabTextActive: {
    color: "#fff",
  },
  input: {
    borderWidth: 1,
    borderColor: "#fbbf24",
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    textAlign: "center",
    backgroundColor: "#fff",
  },
  button: {
    marginTop: 10,
    backgroundColor: "#059669",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "700" },
  codeBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#6ee7b7",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  codeLabel: {
    fontSize: 12,
    color: "#64748b",
  },
  code: {
    marginTop: 6,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 3,
    color: "#065f46",
  },
  qr: {
    width: 208,
    height: 208,
    alignSelf: "center",
    marginTop: 12,
    backgroundColor: "#fff",
  },
  keysBox: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff",
  },
  link: {
    color: "#0369a1",
    textAlign: "right",
    textDecorationLine: "underline",
    fontSize: 12,
    marginTop: 8,
  },
  error: { color: "#dc2626", textAlign: "right", marginTop: 6 },
  message: { color: "#047857", textAlign: "right", marginTop: 6 },
});
