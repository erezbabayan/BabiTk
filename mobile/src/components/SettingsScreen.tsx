import { useEffect, useState } from "react";

import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";

import {

  getGoogleCalendarConnectUrl,

  getGoogleCalendarStatus,

  getProfile,

  type UsageSummary,

  type UserProfile,

} from "../lib/api";

import { PhoneLinkScreen } from "./PhoneLinkScreen";

import { ChannelSettingsModal } from "./ChannelSettingsModal";

import { TagSettingsScreen } from "./TagSettingsScreen";
import { TrashScreen } from "./TrashScreen";
import { BoardSettingsScreen } from "./BoardSettingsScreen";
import { ChangePasswordSection } from "./ChangePasswordSection";
import { TestDataScreen } from "./TestDataScreen";
import { NotebookIcon, type NotebookIconName } from "./NotebookIcons";

import { isDemoMode } from "../lib/supabase";
import { shouldUseConvexAuthLogin } from "../lib/auth-mode";

const OVERDUE_HOUR_OPTIONS = [1, 3, 6, 12, 24, 36, 48, 72, 96, 120, 168] as const;

function formatHoursLabel(hours: number): string {
  if (hours < 24) return `${hours}ש׳`;
  const days = hours / 24;
  if (Number.isInteger(days)) {
    return days === 1 ? "יום" : `${days}ימים`;
  }
  return `${hours}ש׳`;
}

function SettingsMenuRow({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: NotebookIconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress} disabled={disabled}>
      <View style={styles.rowInner}>
        <NotebookIcon name={icon} size={16} tone="slate" />
        <Text style={styles.rowText}>{label}</Text>
      </View>
    </Pressable>
  );
}



interface SettingsScreenProps {

  visible: boolean;

  userId?: string;

  userEmail?: string | null;

  summary: UsageSummary | null;

  onOpenPaywall: () => void;

  onClose: () => void;

  onDataChanged?: () => void;

}



export function SettingsScreen({

  visible,

  userId,

  userEmail,

  summary,

  onOpenPaywall,

  onClose,

  onDataChanged,

}: SettingsScreenProps) {

  const [calendarLinked, setCalendarLinked] = useState(false);

  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [profileLoading, setProfileLoading] = useState(false);

  const [tagsVisible, setTagsVisible] = useState(false);

  const [phoneVisible, setPhoneVisible] = useState(false);

  const [voiceVisible, setVoiceVisible] = useState(false);

  const [notebookVisible, setNotebookVisible] = useState(false);

  const [textVisible, setTextVisible] = useState(false);

  const [userVisible, setUserVisible] = useState(false);

  const [premiumVisible, setPremiumVisible] = useState(false);
  const [trashVisible, setTrashVisible] = useState(false);
  const [boardsVisible, setBoardsVisible] = useState(false);
  const [testDataVisible, setTestDataVisible] = useState(false);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const convexAuth = shouldUseConvexAuthLogin();
  const viewer = useQuery(api.users.viewer, convexAuth ? {} : "skip");
  const updateNotificationPrefs = useMutation(api.users.updateNotificationPrefs);

  useEffect(() => {

    if (!visible) return;

    void getGoogleCalendarStatus()

      .then(setCalendarLinked)

      .catch(() => setCalendarLinked(false));

  }, [visible]);



  useEffect(() => {

    if (!userVisible) return;

    setProfileLoading(true);

    void getProfile()

      .then(setProfile)

      .catch(() => setProfile(null))

      .finally(() => setProfileLoading(false));

  }, [userVisible]);



  async function connectCalendar() {

    const url = await getGoogleCalendarConnectUrl();

    if (url.startsWith("#")) {

      setCalendarLinked(true);

      return;

    }

    await Linking.openURL(url);

  }



  function handleOpenPaywall() {

    onClose();

    onOpenPaywall();

  }



  return (

    <>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>

        <View style={styles.backdrop}>

          <View style={styles.sheet}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.sheetScroll}
            >
            <Text style={styles.title}>הגדרות</Text>

            <SettingsMenuRow icon="keyboard" label="משתמש" onPress={() => setUserVisible(true)} />
            {convexAuth ? (
              <SettingsMenuRow
                icon="bell"
                label="התראות"
                onPress={() => setNotificationsVisible(true)}
              />
            ) : null}
            <SettingsMenuRow
              icon="whatsapp"
              label="וואטסאפ — בחירת קבוצה"
              onPress={() => setPhoneVisible(true)}
            />
            <SettingsMenuRow icon="mic" label="הקלטה קולית" onPress={() => setVoiceVisible(true)} />
            <SettingsMenuRow icon="image" label="סריקת מחברת" onPress={() => setNotebookVisible(true)} />
            <SettingsMenuRow icon="edit" label="קליטת טקסט" onPress={() => setTextVisible(true)} />
            <SettingsMenuRow
              icon="calendar"
              label={calendarLinked ? "יומן מחובר" : "Google Calendar"}
              onPress={() => void connectCalendar()}
              disabled={calendarLinked}
            />
            <SettingsMenuRow
              icon="star"
              label={summary?.isPremium ? "Premium פעיל" : "Premium"}
              onPress={() => setPremiumVisible(true)}
            />
            <SettingsMenuRow icon="tag" label="ניהול תגיות" onPress={() => setTagsVisible(true)} />
            <SettingsMenuRow
              icon="list"
              label="הגדרות בורדים"
              onPress={() => {
                setBoardsVisible(true);
                onClose();
              }}
            />
            <SettingsMenuRow icon="trash" label="סל מחזור" onPress={() => setTrashVisible(true)} />

            {isDemoMode ? (
              <SettingsMenuRow
                icon="document"
                label="נתוני בדיקה"
                onPress={() => setTestDataVisible(true)}
              />
            ) : null}

            <Pressable style={styles.close} onPress={onClose}>
              <Text style={styles.closeText}>סגור</Text>
            </Pressable>
            </ScrollView>
          </View>

        </View>

      </Modal>



      <Modal visible={userVisible} transparent animationType="fade" onRequestClose={() => setUserVisible(false)}>

        <View style={styles.subBackdrop}>

          <View style={styles.subSheet}>

            <Text style={styles.subTitle}>משתמש</Text>

            {profileLoading ? (

              <ActivityIndicator color="#4f46e5" />

            ) : profile ? (
              <>
                <Text style={[styles.profileEmail, { textAlign: "left" }]}>
                  {profile.email}
                </Text>
                <ChangePasswordSection email={profile.email} />
              </>
            ) : (

              <Text style={styles.profileError}>לא ניתן לטעון את פרטי המשתמש.</Text>

            )}

            <Pressable style={styles.subClose} onPress={() => setUserVisible(false)}>

              <Text style={styles.closeText}>סגור</Text>

            </Pressable>

          </View>

        </View>

      </Modal>



      <Modal

        visible={premiumVisible}

        transparent

        animationType="fade"

        onRequestClose={() => setPremiumVisible(false)}

      >

        <View style={styles.subBackdrop}>

          <View style={styles.subSheet}>

            <Text style={styles.subTitle}>Premium</Text>

            {summary?.isPremium ? (

              <>

                <Text style={styles.premiumActive}>יש לך מנוי Premium פעיל.</Text>

                <Pressable style={styles.premiumButton} onPress={handleOpenPaywall}>

                  <Text style={styles.premiumButtonText}>ניהול מנוי</Text>

                </Pressable>

              </>

            ) : summary ? (

              <>

                <Text style={styles.usageText}>

                  מכסת תמלול: {Math.ceil(summary.audio.used / 60)}/
                  {Math.ceil(summary.audio.allocated / 60)} דק׳

                </Text>

                <Text style={styles.usageText}>

                  מכסת AI: {summary.aiParses.used}/{summary.aiParses.allocated}

                </Text>

                <Pressable style={styles.premiumButton} onPress={handleOpenPaywall}>

                  <Text style={styles.premiumButtonText}>שדרג ל-Premium</Text>

                </Pressable>

              </>

            ) : (

              <ActivityIndicator color="#4f46e5" />

            )}

            <Pressable style={styles.subClose} onPress={() => setPremiumVisible(false)}>

              <Text style={styles.closeText}>סגור</Text>

            </Pressable>

          </View>

        </View>

      </Modal>



      <Modal
        visible={notificationsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNotificationsVisible(false)}
      >
        <View style={styles.subBackdrop}>
          <View style={styles.subSheet}>
            <Text style={styles.subTitle}>התראות</Text>
            <ScrollView style={styles.notificationsScroll} nestedScrollEnabled>
            {viewer === undefined ? (
              <ActivityIndicator color="#4f46e5" />
            ) : viewer ? (
              <>
                <View style={styles.toggleRow}>
                  <Switch
                    value={viewer.notifyInApp}
                    onValueChange={(value) => {
                      void updateNotificationPrefs({ notifyInApp: value });
                    }}
                  />
                  <View style={styles.toggleCopy}>
                    <Text style={styles.toggleLabel}>התראות באפליקציה</Text>
                    <Text style={styles.toggleHint}>מרכז התראות והתראות מכשיר</Text>
                  </View>
                </View>
                <View style={styles.toggleRow}>
                  <Switch
                    value={viewer.notifyOverdueReminders}
                    onValueChange={(value) => {
                      void updateNotificationPrefs({ notifyOverdueReminders: value });
                    }}
                  />
                  <View style={styles.toggleCopy}>
                    <Text style={styles.toggleLabel}>תזכורת חוזרת לפריטים שעבר זמנם</Text>
                    <Text style={styles.toggleHint}>
                      פריט שמועד ההתראה שלו עבר ועדיין פתוח
                    </Text>
                  </View>
                </View>
                {viewer.notifyOverdueReminders ? (
                  <View style={styles.overdueTimingBox}>
                    <Text style={styles.overdueTimingLabel}>התראה ראשונה אחרי</Text>
                    <View style={styles.overdueChipRow}>
                      {[
                        ...new Set([...OVERDUE_HOUR_OPTIONS, viewer.overdueFirstHours]),
                      ]
                        .sort((a, b) => a - b)
                        .map((hours) => {
                        const active = viewer.overdueFirstHours === hours;
                        return (
                          <Pressable
                            key={`first-${hours}`}
                            onPress={() => {
                              void updateNotificationPrefs({ overdueFirstHours: hours });
                            }}
                            style={[styles.overdueChip, active && styles.overdueChipActive]}
                          >
                            <Text
                              style={[
                                styles.overdueChipText,
                                active && styles.overdueChipTextActive,
                              ]}
                            >
                              {formatHoursLabel(hours)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={[styles.overdueTimingLabel, styles.overdueTimingLabelSpaced]}>
                      ואז כל
                    </Text>
                    <View style={styles.overdueChipRow}>
                      {[
                        ...new Set([...OVERDUE_HOUR_OPTIONS, viewer.overdueRepeatHours]),
                      ]
                        .sort((a, b) => a - b)
                        .map((hours) => {
                        const active = viewer.overdueRepeatHours === hours;
                        return (
                          <Pressable
                            key={`repeat-${hours}`}
                            onPress={() => {
                              void updateNotificationPrefs({ overdueRepeatHours: hours });
                            }}
                            style={[styles.overdueChip, active && styles.overdueChipActive]}
                          >
                            <Text
                              style={[
                                styles.overdueChipText,
                                active && styles.overdueChipTextActive,
                              ]}
                            >
                              {formatHoursLabel(hours)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}
                <View style={styles.toggleRow}>
                  <Switch
                    value={viewer.notifyWhatsApp}
                    disabled={!viewer.phoneVerified}
                    onValueChange={(value) => {
                      void updateNotificationPrefs({ notifyWhatsApp: value });
                    }}
                  />
                  <View style={styles.toggleCopy}>
                    <Text
                      style={[
                        styles.toggleLabel,
                        !viewer.phoneVerified ? styles.toggleDisabled : null,
                      ]}
                    >
                      התראות WhatsApp
                    </Text>
                    <Text style={styles.toggleHint}>
                      {viewer.phoneVerified
                        ? `שליחה לטלפון המאומת כשמגיע מועד התזכורת, וסיכום יומי ב־${viewer.whatsappDigestHours.map((h: number) => `${String(h).padStart(2, "0")}:00`).join(", ")} (בהגדרות וואטסאפ)`
                        : "דורש טלפון מאומת בהגדרות וואטסאפ"}
                    </Text>
                  </View>
                </View>
                <View style={styles.toggleRow}>
                  <Switch
                    value={viewer.notifyWhatsAppGroup === true}
                    disabled={
                      !viewer.phoneVerified || !viewer.whatsappCaptureGroupChatId
                    }
                    onValueChange={(value) => {
                      void updateNotificationPrefs({ notifyWhatsAppGroup: value });
                    }}
                  />
                  <View style={styles.toggleCopy}>
                    <Text
                      style={[
                        styles.toggleLabel,
                        !viewer.phoneVerified || !viewer.whatsappCaptureGroupChatId
                          ? styles.toggleDisabled
                          : null,
                      ]}
                    >
                      תזכורות משימה לקבוצת וואטסאפ
                    </Text>
                    <Text style={styles.toggleHint}>
                      {!viewer.phoneVerified
                        ? "דורש טלפון מאומת בהגדרות וואטסאפ"
                        : !viewer.whatsappCaptureGroupChatId
                          ? "דורש קבוצת קליטה מוגדרת בהגדרות וואטסאפ"
                          : `כשמגיע מועד תזכורת — שליחה לקבוצה «${viewer.whatsappCaptureGroupName?.trim() || "קבוצת הקליטה"}»`}
                    </Text>
                  </View>
                </View>
              </>
            ) : (
              <Text style={styles.profileError}>לא ניתן לטעון העדפות התראות.</Text>
            )}
            </ScrollView>
            <Pressable style={styles.subClose} onPress={() => setNotificationsVisible(false)}>
              <Text style={styles.closeText}>סגור</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <TagSettingsScreen

        visible={tagsVisible}

        onClose={() => setTagsVisible(false)}

      />



      <PhoneLinkScreen
        visible={phoneVisible}
        userId={userId}
        summary={summary}
        onClose={() => setPhoneVisible(false)}
      />



      <ChannelSettingsModal
        visible={voiceVisible}
        channelId="voice"
        summary={summary}
        onClose={() => setVoiceVisible(false)}
      />



      <ChannelSettingsModal
        visible={notebookVisible}
        channelId="notebook"
        summary={summary}
        onClose={() => setNotebookVisible(false)}
      />



      <ChannelSettingsModal
        visible={textVisible}
        channelId="text"
        summary={summary}
        onClose={() => setTextVisible(false)}
      />

      <TrashScreen
        visible={trashVisible}
        onClose={() => setTrashVisible(false)}
        userId={userId}
      />

      <BoardSettingsScreen
        visible={boardsVisible}
        userId={userId}
        userEmail={userEmail}
        onClose={() => setBoardsVisible(false)}
      />

      <TestDataScreen
        visible={testDataVisible}
        onClose={() => setTestDataVisible(false)}
        onChanged={() => onDataChanged?.()}
      />

    </>

  );

}



const styles = StyleSheet.create({

  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },

  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    maxHeight: "88%",
  },
  sheetScroll: {
    paddingBottom: 8,
  },

  title: { fontSize: 18, fontWeight: "800", textAlign: "right", marginBottom: 16 },

  row: {

    paddingVertical: 14,

    borderBottomWidth: 1,

    borderBottomColor: "#f1f5f9",

  },

  rowInner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },

  rowText: { fontSize: 15, textAlign: "right", color: "#334155" },

  close: { marginTop: 16, alignItems: "center" },

  closeText: { color: "#64748b", fontSize: 15 },

  subBackdrop: {

    flex: 1,

    justifyContent: "center",

    backgroundColor: "rgba(0,0,0,0.4)",

    padding: 24,

  },

  subSheet: {

    backgroundColor: "#fff",

    borderRadius: 16,

    padding: 20,

  },

  subTitle: { fontSize: 18, fontWeight: "700", textAlign: "right", marginBottom: 12 },

  profileEmail: { fontSize: 15, color: "#334155", textAlign: "center", marginBottom: 8 },

  profileError: { fontSize: 14, color: "#64748b", textAlign: "right", marginBottom: 8 },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  toggleCopy: { flex: 1 },
  toggleLabel: { fontSize: 15, color: "#0f172a", textAlign: "right", fontWeight: "600" },
  toggleDisabled: { color: "#94a3b8" },
  toggleHint: { fontSize: 12, color: "#64748b", textAlign: "right", marginTop: 4 },
  notificationsScroll: { maxHeight: 420 },
  overdueTimingBox: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    backgroundColor: "#f8fafc",
    gap: 8,
  },
  overdueTimingLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    textAlign: "right",
  },
  overdueTimingLabelSpaced: { marginTop: 4 },
  overdueChipRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 6,
  },
  overdueChip: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  overdueChipActive: {
    borderColor: "#2563eb",
    backgroundColor: "#dbeafe",
  },
  overdueChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  overdueChipTextActive: { color: "#1d4ed8" },

  premiumActive: { fontSize: 15, color: "#047857", textAlign: "right", marginBottom: 12 },

  usageText: { fontSize: 15, color: "#334155", textAlign: "right", marginBottom: 12 },

  premiumButton: {

    backgroundColor: "#059669",

    borderRadius: 10,

    padding: 14,

    alignItems: "center",

  },

  premiumButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  subClose: { marginTop: 16, alignItems: "center" },

});

