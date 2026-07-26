import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAction, useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  getProfile,
  requestPhoneVerification,
  verifyPhoneCode,
  type UsageSummary,
  type UserProfile,
} from "../lib/api";
import { shouldUseConvexAuthLogin } from "../lib/auth-mode";
import { isConvexConfigured } from "../lib/convex";
import { isDemoMode, isSupabaseConfigured } from "../lib/supabase";
import { ChannelInfoView } from "./ChannelInfoView";

const DIGEST_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MAX_DIGEST_HOURS = 3;

function viewerDisplayName(viewer: {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
} | null | undefined): string {
  const full = viewer?.name?.trim();
  if (full) return full;
  return [viewer?.firstName, viewer?.lastName].filter(Boolean).join(" ").trim();
}

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
  const useConvexPhone =
    shouldUseConvexAuthLogin() || (isDemoMode && isConvexConfigured);
  const viewer = useQuery(
    api.users.viewer,
    visible && useConvexPhone ? {} : "skip",
  );
  const linkVerifiedPhone = useMutation(api.users.linkVerifiedPhone);
  const updateNotificationPrefs = useMutation(api.users.updateNotificationPrefs);
  const bindExistingGroup = useAction(api.whatsappCaptureGroupActions.bindExistingCaptureGroup);
  const listCaptureGroups = useAction(api.whatsappCaptureGroupActions.listCaptureGroups);
  const clearWhatsAppCaptureGroup = useMutation(api.users.clearWhatsAppCaptureGroup);
  const saveWhatsAppCaptureGroup = useMutation(api.users.saveWhatsAppCaptureGroup);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"idle" | "verify">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingDigestHours, setSavingDigestHours] = useState(false);
  const [savingDigestDays, setSavingDigestDays] = useState(false);
  const [bindingGroup, setBindingGroup] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [selectingGroupId, setSelectingGroupId] = useState<string | null>(null);
  const [groupOptions, setGroupOptions] = useState<Array<{ chatId: string; name: string }>>(
    [],
  );
  const [groupSearch, setGroupSearch] = useState("");
  const [awaitingGroupMessage, setAwaitingGroupMessage] = useState(false);

  useEffect(() => {
    if (!visible || !useConvexPhone || !viewer) return;
    const defaultName = viewerDisplayName(viewer);
    if (defaultName) {
      setGroupSearch((prev) => (prev.trim() ? prev : defaultName));
    }
  }, [
    visible,
    useConvexPhone,
    viewer?.userId,
    viewer?.name,
    viewer?.firstName,
    viewer?.lastName,
  ]);

  useEffect(() => {
    if (!visible || useConvexPhone || !isSupabaseConfigured) return;
    void getProfile()
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [visible, useConvexPhone]);

  useEffect(() => {
    if (viewer?.whatsappCaptureGroupChatId && awaitingGroupMessage) {
      setAwaitingGroupMessage(false);
      setMessage(
        `הקבוצה חוברה: ${viewer.whatsappCaptureGroupName?.trim() || "יעד קליטה"}`,
      );
    }
  }, [
    viewer?.whatsappCaptureGroupChatId,
    viewer?.whatsappCaptureGroupName,
    awaitingGroupMessage,
  ]);

  useEffect(() => {
    if (!visible || !useConvexPhone || !viewer?.phoneVerified) return;
    let cancelled = false;
    void (async () => {
      setLoadingGroups(true);
      try {
        const result = await listCaptureGroups({});
        if (cancelled) return;
        setGroupOptions(result.groups);
        if (!result.ok && result.reason) {
          setError(result.reason);
        }
      } catch {
        if (!cancelled) setGroupOptions([]);
      } finally {
        if (!cancelled) setLoadingGroups(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, useConvexPhone, viewer?.phoneVerified, listCaptureGroups]);

  const digestHours = viewer?.whatsappDigestHours ?? [9];
  const digestDays = viewer?.whatsappDigestDays ?? "everyday";
  const convexReady = Boolean(viewer?.userId);

  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    if (!q) return [];
    return groupOptions.filter((g) => g.name.toLowerCase().includes(q));
  }, [groupOptions, groupSearch]);
  const hasGroupSearch = groupSearch.trim().length > 0;

  const linkedPhone = useConvexPhone
    ? viewer?.phoneVerified && viewer.phone
      ? viewer.phone
      : null
    : profile?.phone_verified
      ? profile.phone
      : null;

  async function handleDigestDaysChange(next: "weekdays" | "everyday") {
    if (next === digestDays) return;
    setSavingDigestDays(true);
    setError(null);
    try {
      await updateNotificationPrefs({ whatsappDigestDays: next });
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
      await updateNotificationPrefs({ whatsappDigestHours: next });
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירת שעות התזכורת");
    } finally {
      setSavingDigestHours(false);
    }
  }

  async function handleConvexLink() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      if (!viewer?.userId) {
        throw new Error("המשתמש עדיין נטען. נסה שוב בעוד רגע.");
      }
      const linked = await linkVerifiedPhone({
        userId: viewer.userId as Id<"users">,
        phone,
      });
      setPhone("");
      setMessage(`מחובר: ${linked}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

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

  async function handleBindExistingGroup() {
    const name = groupSearch.trim() || viewerDisplayName(viewer);
    if (!name) {
      setError("הזינו שם קבוצה קיימת לחיבור");
      return;
    }
    setBindingGroup(true);
    setError(null);
    setMessage(null);
    try {
      const result = await bindExistingGroup({
        groupName: name,
        replaceExisting: true,
      });
      if (result.ok) {
        setMessage(`חוברה הקבוצה «${result.name?.trim() || name}».`);
        const refresh = await listCaptureGroups({}).catch(() => null);
        if (refresh?.groups) setGroupOptions(refresh.groups);
      } else {
        setError(result.reason ?? "חיבור הקבוצה נכשל");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בחיבור קבוצה");
    } finally {
      setBindingGroup(false);
    }
  }

  async function handleSelectGroup(chatId: string, name: string) {
    setSelectingGroupId(chatId);
    setError(null);
    setMessage(null);
    try {
      await saveWhatsAppCaptureGroup({ chatId, name });
      setGroupSearch(name);
      setMessage(`הקבוצה «${name}» חוברה.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בבחירת קבוצה");
    } finally {
      setSelectingGroupId(null);
    }
  }

  async function handleClearCaptureGroup() {
    setError(null);
    setMessage(null);
    try {
      await clearWhatsAppCaptureGroup({});
      setAwaitingGroupMessage(false);
      setMessage("יעד הקליטה נותק.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בניתוק");
    }
  }

  async function handleBindByGroupMessage() {
    setError(null);
    setMessage(null);
    try {
      await clearWhatsAppCaptureGroup({});
      setAwaitingGroupMessage(true);
      setMessage(
        "פתחו בוואטסאפ את הקבוצה הקיימת ושלחו שם הודעה — היא תתחבר אוטומטית.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>וואטסאפ</Text>
            <ChannelInfoView channelId="whatsapp" summary={summary} compact>
              {linkedPhone ? (
                <Text style={styles.ok}>מחובר: {linkedPhone}</Text>
              ) : useConvexPhone ? (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="+972501234567"
                    placeholderTextColor="#94a3b8"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                  />
                  <Pressable
                    style={[styles.button, (loading || !convexReady) && styles.buttonDisabled]}
                    onPress={() => void handleConvexLink()}
                    disabled={loading || !convexReady}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.buttonText}>
                        {convexReady ? "חבר מספר" : "מכין חיבור..."}
                      </Text>
                    )}
                  </Pressable>
                </>
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

              {linkedPhone && useConvexPhone ? (
                <View style={styles.captureBox}>
                  <Text style={styles.captureTitle}>קבוצת קליטה</Text>
                  {viewer?.whatsappCaptureGroupChatId ? (
                    <>
                      <Text style={styles.ok}>
                        {viewer.whatsappCaptureGroupChatId
                          .trim()
                          .toLowerCase()
                          .endsWith("@c.us")
                          ? "יעד קליטה: "
                          : "מחוברת: "}
                        {viewer.whatsappCaptureGroupName?.trim() ||
                          (viewer.whatsappCaptureGroupChatId
                            .trim()
                            .toLowerCase()
                            .endsWith("@c.us")
                            ? "הודעה לעצמי"
                            : "קבוצה")}
                      </Text>
                      {viewer.whatsappCaptureGroupChatId
                        .trim()
                        .toLowerCase()
                        .endsWith("@c.us") ? (
                        <Text style={styles.warn}>
                          כרגע קליטה מ«הודעה לעצמי». לקליטה מקבוצה — חפשו וחברו למטה.
                        </Text>
                      ) : null}
                      <Pressable
                        style={{ marginTop: 4, marginBottom: 4 }}
                        onPress={() => void handleClearCaptureGroup()}
                      >
                        <Text style={styles.clearLink}>נתק מהקבוצה</Text>
                      </Pressable>
                    </>
                  ) : awaitingGroupMessage ? (
                    <Text style={styles.warn}>
                      ממתין: שלחו הודעה בקבוצה הקיימת בוואטסאפ.
                    </Text>
                  ) : (
                    <Text style={styles.warn}>
                      חיבור לקבוצה קיימת בלבד — חפשו וחברו.
                    </Text>
                  )}

                  <Text style={styles.searchLabel}>חיפוש קבוצה קיימת</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="שם הקבוצה…"
                    placeholderTextColor="#94a3b8"
                    value={groupSearch}
                    onChangeText={setGroupSearch}
                    autoCorrect={false}
                  />

                  <Pressable
                    style={[styles.primaryButton, bindingGroup && styles.buttonDisabled]}
                    disabled={bindingGroup || !groupSearch.trim()}
                    onPress={() => void handleBindExistingGroup()}
                  >
                    {bindingGroup ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.buttonText}>
                        {groupSearch.trim()
                          ? `חבר קבוצה «${groupSearch.trim()}»`
                          : "חבר קבוצה"}
                      </Text>
                    )}
                  </Pressable>
                  <Pressable
                    style={[styles.outlineButton, { marginTop: 8 }]}
                    onPress={() => void handleBindByGroupMessage()}
                  >
                    <Text style={styles.outlineButtonText}>
                      חבר ע״י הודעה בקבוצה הקיימת
                    </Text>
                  </Pressable>
                  <Text style={styles.hint}>
                    אפשר להקליד חלק מהשם (למשל משימות) — יימצאו התאמות.
                  </Text>
                  {hasGroupSearch ? (
                    loadingGroups ? (
                      <ActivityIndicator color="#0369a1" style={{ marginVertical: 8 }} />
                    ) : (
                      <View style={styles.groupList}>
                        {filteredGroups.length === 0 ? (
                          <Text style={styles.hint}>לא נמצאה קבוצה תואמת.</Text>
                        ) : (
                          filteredGroups.map((group) => {
                            const selected =
                              viewer?.whatsappCaptureGroupChatId === group.chatId;
                            const busy = selectingGroupId === group.chatId;
                            return (
                              <Pressable
                                key={group.chatId}
                                style={[
                                  styles.groupRow,
                                  selected ? styles.groupRowSelected : null,
                                ]}
                                disabled={Boolean(selectingGroupId)}
                                onPress={() =>
                                  void handleSelectGroup(group.chatId, group.name)
                                }
                              >
                                <Text style={styles.groupRowText}>
                                  {busy ? "מחבר…" : group.name}
                                </Text>
                                {selected ? (
                                  <Text style={styles.groupRowBadge}>מחובר</Text>
                                ) : null}
                              </Pressable>
                            );
                          })
                        )}
                      </View>
                    )
                  ) : (
                    <Text style={styles.hint}>הקלידו שם קבוצה כדי לחפש ולחבר.</Text>
                  )}

                </View>
              ) : null}

              {useConvexPhone ? (
                <View style={styles.digestBox}>
                  <Text style={styles.digestTitle}>תזכורת יומית</Text>
                  <Text style={styles.hint}>
                    סיכום התזכורות של אותו יום — עד {MAX_DIGEST_HOURS} מועדים.
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
                            viewer === undefined || savingDigestDays || savingDigestHours
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
                          disabled={viewer === undefined || savingDigestHours || atLimit}
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

              {message ? <Text style={styles.message}>{message}</Text> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </ChannelInfoView>
            <Pressable onPress={onClose} style={styles.close}>
              <Text style={styles.closeText}>סגור</Text>
            </Pressable>
          </ScrollView>
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
