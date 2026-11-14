import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeModal } from "./SafeModal";

import {
  getProfile,
  requestPhoneVerification,
  verifyPhoneCode,
  type UsageSummary,
  type UserProfile,
} from "../lib/api";
import { isSupabaseConfigured } from "../lib/supabase";
import { ChannelInfoView } from "./ChannelInfoView";
import { GreenApiConnectSettings } from "./GreenApiConnectSettings";
import {
  loadProactiveWhatsAppPrefs,
  loadWhatsAppNotifyPrefs,
  saveNotifyWhatsAppGroup,
  saveProactiveWhatsAppPrefs,
  saveWhatsAppDigestDays,
  saveWhatsAppDigestHours,
  type ProactiveWhatsAppPrefs,
} from "../lib/whatsapp-gateway";
import { sendWhatsAppReminderTest } from "../lib/whatsapp-reminders";
import { confirmWhatsAppPhoneOtp, requestWhatsAppPhoneOtp } from "../lib/phone-otp";

const DIGEST_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MAX_DIGEST_HOURS = 3;

function formatDigestHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatDigestHoursList(hours: number[]): string {
  return hours.map(formatDigestHour).join(", ");
}

interface PhoneLinkScreenProps {
  visible: boolean;
  userId?: string;
  summary: UsageSummary | null;
  onClose: () => void;
}

export function PhoneLinkScreen({ visible, summary, onClose }: PhoneLinkScreenProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingDigestHours, setSavingDigestHours] = useState(false);
  const [savingDigestDays, setSavingDigestDays] = useState(false);
  const [notifyWhatsAppGroup, setNotifyWhatsAppGroup] = useState(false);
  const [captureGroupName, setCaptureGroupName] = useState<string | null>(null);
  const [captureGroupChatId, setCaptureGroupChatId] = useState<string | null>(null);
  const [savingNotifyGroup, setSavingNotifyGroup] = useState(false);
  const [testingReminder, setTestingReminder] = useState(false);
  const [cloudDigestHours, setCloudDigestHours] = useState<number[]>([9]);
  const [cloudDigestDays, setCloudDigestDays] = useState<"weekdays" | "everyday">("everyday");
  const [proactive, setProactive] = useState<ProactiveWhatsAppPrefs | null>(null);

  useEffect(() => {
    if (!visible || !isSupabaseConfigured) return;
    void getProfile()
      .then(setProfile)
      .catch(() => setProfile(null));
    void loadWhatsAppNotifyPrefs()
      .then((prefs) => {
        setNotifyWhatsAppGroup(prefs.notifyWhatsAppGroup);
        setCaptureGroupChatId(prefs.captureGroupChatId);
        setCaptureGroupName(prefs.captureGroupName);
        setCloudDigestHours(prefs.digestHours);
        setCloudDigestDays(prefs.digestDays);
      })
      .catch(() => undefined);
    void loadProactiveWhatsAppPrefs()
      .then(setProactive)
      .catch(() => setProactive(null));
  }, [visible]);

  const digestHours = cloudDigestHours;
  const digestDays = cloudDigestDays;

  const linkedPhone = profile?.phone_verified ? profile.phone : null;
  const captureIsGroup = (captureGroupChatId ?? "").toLowerCase().endsWith("@g.us");

  useEffect(() => {
    if (!visible || !captureIsGroup || notifyWhatsAppGroup) return;
    let cancelled = false;
    void saveNotifyWhatsAppGroup(true)
      .then(() => {
        if (!cancelled) setNotifyWhatsAppGroup(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [visible, captureIsGroup, notifyWhatsAppGroup]);

  async function handleDigestDaysChange(next: "weekdays" | "everyday") {
    if (next === digestDays) return;
    setSavingDigestDays(true);
    setError(null);
    try {
      await saveWhatsAppDigestDays(next);
      setCloudDigestDays(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירת ימי השליחה");
    } finally {
      setSavingDigestDays(false);
    }
  }

  async function handleDigestHourToggle(hour: number) {
    const selected = digestHours.includes(hour);
    let next: number[];
    if (selected) {
      if (digestHours.length <= 1) {
        setError("יש לבחור לפחות מועד אחד");
        return;
      }
      next = digestHours.filter((value) => value !== hour);
    } else {
      if (digestHours.length >= MAX_DIGEST_HOURS) {
        setError(`ניתן לבחור עד ${MAX_DIGEST_HOURS} מועדים`);
        return;
      }
      next = [...digestHours, hour].sort((a, b) => a - b);
    }

    setSavingDigestHours(true);
    setError(null);
    try {
      await saveWhatsAppDigestHours(next);
      setCloudDigestHours(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירת שעות התזכורת");
    } finally {
      setSavingDigestHours(false);
    }
  }

  async function handleRequestCode() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      if (isSupabaseConfigured) {
        const result = await requestWhatsAppPhoneOtp(phone);
        setMessage(result.message);
        return;
      }
      const result = await requestPhoneVerification(phone);
      setMessage(result.devCode ? `${result.message}: ${result.devCode}` : result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשליחת הקוד");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmCode() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      if (isSupabaseConfigured) {
        const result = await confirmWhatsAppPhoneOtp(code.trim());
        const next = await getProfile().catch(() => null);
        setProfile(
          next ?? {
            id: "",
            email: "",
            phone: result.phone ?? phone,
            phone_verified: true,
            phone_pending: null,
          },
        );
        setPhone("");
        setCode("");
        setMessage(result.message);
        return;
      }
      const result = await verifyPhoneCode(code.trim());
      setProfile(result.profile);
      setPhone("");
      setCode("");
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "הקוד לא אומת");
    } finally {
      setLoading(false);
    }
  }

  async function handleNotifyGroupToggle(enabled: boolean) {
    if (!captureIsGroup) {
      setError("קודם חברו קבוצת קליטה, ואז אפשר לקבל אליה תזכורות.");
      return;
    }
    setSavingNotifyGroup(true);
    setError(null);
    setMessage(null);
    try {
      await saveNotifyWhatsAppGroup(enabled);
      setNotifyWhatsAppGroup(enabled);
      setMessage(
        enabled
          ? "תזכורות פעילות יישלחו כהודעה לקבוצת הוואטסאפ שהוגדרה."
          : "תזכורות לקבוצה כובו.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירת הגדרת התזכורות");
    } finally {
      setSavingNotifyGroup(false);
    }
  }

  async function handleTestReminder() {
    setTestingReminder(true);
    setError(null);
    setMessage(null);
    try {
      const result = await sendWhatsAppReminderTest();
      setMessage(
        result.sent
          ? "נשלחה הודעת בדיקה לקבוצת הוואטסאפ. בדקו שההודעה הגיעה."
          : "אין יעד לשליחה — חברו קבוצה או וואטסאפ.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "שליחת הבדיקה נכשלה");
    } finally {
      setTestingReminder(false);
    }
  }

  return (
    <SafeModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>וואטסאפ</Text>
            <ChannelInfoView channelId="whatsapp" summary={summary} compact>
              {isSupabaseConfigured && visible ? (
                <GreenApiConnectSettings
                  onLinked={() => {
                    void getProfile()
                      .then(setProfile)
                      .catch(() => undefined);
                    void loadWhatsAppNotifyPrefs()
                      .then((prefs) => {
                        setNotifyWhatsAppGroup(prefs.notifyWhatsAppGroup);
                        setCaptureGroupChatId(prefs.captureGroupChatId);
                        setCaptureGroupName(prefs.captureGroupName);
                        setCloudDigestHours(prefs.digestHours);
                        setCloudDigestDays(prefs.digestDays);
                      })
                      .catch(() => undefined);
                  }}
                />
              ) : null}
              {isSupabaseConfigured ? (
                <View style={styles.captureBox}>
                  <Text style={styles.captureTitle}>תזכורות פעילות לקבוצה</Text>
                  <Text style={styles.hint}>
                    {captureIsGroup
                      ? `כל תזכורת של משימה או הערה נשלחת לקבוצה «${captureGroupName?.trim() || "קבוצת הקליטה"}» בזמן שמוגדר לה.`
                      : "דורש קבוצת וואטסאפ שהוגדרה (לא הודעה אישית)"}
                  </Text>
                  <Pressable
                    style={[
                      styles.primaryButton,
                      (!captureIsGroup || savingNotifyGroup) && styles.buttonDisabled,
                    ]}
                    disabled={!captureIsGroup || savingNotifyGroup}
                    onPress={() => void handleNotifyGroupToggle(!notifyWhatsAppGroup)}
                  >
                    {savingNotifyGroup ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.buttonText}>
                        {notifyWhatsAppGroup || captureIsGroup
                          ? "תזכורות לקבוצה פעילות"
                          : "קבל תזכורות כהודעה בקבוצה"}
                      </Text>
                    )}
                  </Pressable>
                  {captureIsGroup ? (
                    <Pressable
                      style={[styles.button, testingReminder && styles.buttonDisabled]}
                      disabled={testingReminder}
                      onPress={() => void handleTestReminder()}
                    >
                      {testingReminder ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.buttonText}>שלחו הודעת בדיקה לקבוצה</Text>
                      )}
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              {linkedPhone ? (
                <Text style={styles.ok}>מחובר: {linkedPhone}</Text>
              ) : (
                <>
                  <Text style={styles.captureTitle}>אימות מספר בוואטסאפ</Text>
                  <Text style={styles.hint}>
                    חברו קודם את וואטסאפ. נשלח קוד בן 6 ספרות, והוא תקף ל-10 דקות. בלי הקוד הנכון המספר לא נקלט.
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="+972501234567"
                    placeholderTextColor="#94a3b8"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                  />
                  <Pressable
                    style={[styles.button, (loading || !phone.trim()) && styles.buttonDisabled]}
                    onPress={() => void handleRequestCode()}
                    disabled={loading || !phone.trim()}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.buttonText}>
                        שלחו קוד
                      </Text>
                    )}
                  </Pressable>
                  <TextInput
                    style={styles.input}
                    placeholder="קוד בן 6 ספרות"
                    placeholderTextColor="#94a3b8"
                    value={code}
                    onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                  <Pressable
                    style={[styles.button, (loading || code.length !== 6) && styles.buttonDisabled]}
                    onPress={() => void handleConfirmCode()}
                    disabled={loading || code.length !== 6}
                  >
                    <Text style={styles.buttonText}>אשרו את המספר</Text>
                  </Pressable>
                </>
              )}

              {isSupabaseConfigured ? (
                <View style={styles.digestBox}>
                  <Text style={styles.digestTitle}>ריכוז תזכורות</Text>
                  <Text style={styles.hint}>
                    בשעות האלה נשלחת רשימת התזכורות של היום. כל תזכורת נשלחת גם בזמן שמוגדר לה.
                  </Text>
                  <Text style={styles.digestLabel}>ימי שליחה</Text>
                  <View style={styles.hourGrid}>
                    {(
                      [
                        { id: "weekdays" as const, label: "ימי חול (א׳–ה׳)" },
                        { id: "everyday" as const, label: "כל השבוע" },
                      ] as const
                    ).map((option) => {
                      const selected = digestDays === option.id;
                      return (
                        <Pressable
                          key={option.id}
                          style={[
                            styles.hourChip,
                            selected && styles.hourChipSelected,
                          ]}
                          disabled={
                            !isSupabaseConfigured ||
                            savingDigestDays ||
                            savingDigestHours
                          }
                          onPress={() => void handleDigestDaysChange(option.id)}
                        >
                          <Text
                            style={[
                              styles.hourChipText,
                              selected && styles.hourChipTextSelected,
                            ]}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={styles.digestLabel}>
                    מועדי שליחה
                    {digestHours.length > 0
                      ? ` · ${formatDigestHoursList(digestHours)}`
                      : ""}
                  </Text>
                  <View style={styles.hourGrid}>
                    {DIGEST_HOURS.map((hour) => {
                      const selected = digestHours.includes(hour);
                      const atLimit = !selected && digestHours.length >= MAX_DIGEST_HOURS;
                      return (
                        <Pressable
                          key={hour}
                          style={[
                            styles.hourChip,
                            selected && styles.hourChipSelected,
                            atLimit && styles.hourChipDisabled,
                          ]}
                          disabled={
                            !isSupabaseConfigured ||
                            savingDigestHours ||
                            atLimit
                          }
                          onPress={() => void handleDigestHourToggle(hour)}
                        >
                          <Text
                            style={[
                              styles.hourChipText,
                              selected && styles.hourChipTextSelected,
                            ]}
                          >
                            {formatDigestHour(hour)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={styles.digestSaving}>
                    {digestDays === "weekdays" ? "ימי חול בלבד · " : "כל השבוע · "}
                    עד {MAX_DIGEST_HOURS} שעות ביום
                    {savingDigestHours || savingDigestDays ? " · שומר…" : ""}
                  </Text>
                </View>
              ) : null}

              {proactive ? (
                <View style={styles.digestBox}>
                  <Text style={styles.digestTitle}>בריפינג ומעקב</Text>
                  <Text style={styles.hint}>
                    שעון ישראל. דלוק בשרת כברירת מחדל, ואפשר לכבות בדגל. נשלח רק אחרי הסימון כאן, עד 3 ביום.
                  </Text>
                  <View style={styles.hourGrid}>
                    <Text style={styles.digestLabel}>בריפינג בוקר {proactive.morningHour}:30</Text>
                    <Switch
                      value={proactive.morningEnabled}
                      onValueChange={(morningEnabled) => {
                        setProactive({ ...proactive, morningEnabled });
                        void saveProactiveWhatsAppPrefs({ morningEnabled }).catch((err) =>
                          setError(err instanceof Error ? err.message : "שמירה נכשלה"),
                        );
                      }}
                    />
                  </View>
                  <View style={styles.hourGrid}>
                    <Text style={styles.digestLabel}>מעקב פתוחות {proactive.followUpHour}:00</Text>
                    <Switch
                      value={proactive.followUpEnabled}
                      onValueChange={(followUpEnabled) => {
                        setProactive({ ...proactive, followUpEnabled });
                        void saveProactiveWhatsAppPrefs({ followUpEnabled }).catch((err) =>
                          setError(err instanceof Error ? err.message : "שמירה נכשלה"),
                        );
                      }}
                    />
                  </View>
                  {proactive.weeklyEnabled !== undefined ? (
                    <View style={styles.hourGrid}>
                      <Text style={styles.digestLabel}>סיכום שבועי ביום שישי ב-13:00</Text>
                      <Switch
                        value={proactive.weeklyEnabled}
                        onValueChange={(weeklyEnabled) => {
                          setProactive({ ...proactive, weeklyEnabled });
                          void saveProactiveWhatsAppPrefs({ weeklyEnabled }).catch((err) =>
                            setError(err instanceof Error ? err.message : "שמירה נכשלה"),
                          );
                        }}
                      />
                    </View>
                  ) : null}
                  {proactive.shabbatModeEnabled !== undefined ? (
                    <View style={styles.hourGrid}>
                      <Text style={styles.digestLabel}>מצב שבת: בלי הודעות מהדלקת נרות עד להבדלה</Text>
                      <Switch
                        value={proactive.shabbatModeEnabled}
                        onValueChange={(shabbatModeEnabled) => {
                          setProactive({ ...proactive, shabbatModeEnabled });
                          void saveProactiveWhatsAppPrefs({ shabbatModeEnabled }).catch((err) =>
                            setError(err instanceof Error ? err.message : "שמירה נכשלה"),
                          );
                        }}
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}

              {message ? <Text style={styles.message}>{message}</Text> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </ChannelInfoView>
            <Pressable onPress={onClose} style={styles.close}>
              <Text style={styles.closeText}>סגור</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </SafeModal>
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
    maxHeight: "90%",
  },
  scrollContent: {
    paddingBottom: 4,
  },
  title: { fontSize: 18, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  ok: { color: "#047857", textAlign: "right", marginBottom: 8 },
  warn: { color: "#b45309", textAlign: "right", marginBottom: 8, fontSize: 13 },
  hint: {
    marginTop: 6,
    fontSize: 12,
    color: "#64748b",
    textAlign: "right",
    lineHeight: 18,
  },
  captureBox: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#7dd3fc",
    padding: 12,
  },
  captureTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0c4a6e",
    textAlign: "right",
    marginBottom: 6,
  },
  searchLabel: {
    marginTop: 14,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "600",
    color: "#0c4a6e",
    textAlign: "right",
  },
  groupList: {
    marginTop: 4,
    maxHeight: 220,
    borderWidth: 1,
    borderColor: "#bae6fd",
    borderRadius: 10,
    backgroundColor: "#fff",
    padding: 8,
  },
  groupRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  groupRowSelected: { backgroundColor: "#e0f2fe" },
  groupRowText: { color: "#0f172a", fontSize: 14, textAlign: "right", flex: 1 },
  groupRowBadge: { color: "#0369a1", fontSize: 12, fontWeight: "700", marginLeft: 8 },
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
  primaryButton: {
    marginTop: 8,
    backgroundColor: "#0369a1",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: "#7dd3fc",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  outlineButtonText: { color: "#0369a1", fontWeight: "700", fontSize: 13 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#fff", fontWeight: "700" },
  clearLink: {
    color: "#0369a1",
    textAlign: "right",
    textDecorationLine: "underline",
    fontSize: 12,
  },
  digestBox: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    padding: 12,
  },
  digestTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "right",
  },
  digestLabel: {
    marginTop: 10,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
    textAlign: "right",
  },
  hourGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "flex-start",
  },
  hourChip: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  hourChipSelected: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },
  hourChipDisabled: {
    opacity: 0.4,
  },
  hourChipText: {
    fontSize: 12,
    color: "#334155",
  },
  hourChipTextSelected: {
    color: "#1d4ed8",
    fontWeight: "700",
  },
  digestSaving: {
    marginTop: 8,
    fontSize: 12,
    color: "#64748b",
    textAlign: "right",
  },
  message: { color: "#047857", marginTop: 8, textAlign: "right" },
  error: { color: "#dc2626", marginTop: 8, textAlign: "right" },
  close: { marginTop: 16, alignItems: "center" },
  closeText: { color: "#64748b", fontSize: 15 },
});
