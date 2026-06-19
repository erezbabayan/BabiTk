import { useEffect, useState } from "react";

import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";

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
import { TestDataScreen } from "./TestDataScreen";

import type { UserTag } from "../lib/tags";
import { isDemoMode } from "../lib/supabase";



interface SettingsScreenProps {

  visible: boolean;

  userId?: string;

  userTags: UserTag[];

  summary: UsageSummary | null;

  onSaveTags: (tags: { name: string; color: string }[]) => Promise<void>;

  onOpenPaywall: () => void;

  onClose: () => void;

  onDataChanged?: () => void;

}



export function SettingsScreen({

  visible,

  userId,

  userTags,

  summary,

  onSaveTags,

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

            <Text style={styles.title}>הגדרות</Text>



            <Pressable style={styles.row} onPress={() => setUserVisible(true)}>

              <Text style={styles.rowText}>👤 משתמש</Text>

            </Pressable>



            <Pressable style={styles.row} onPress={() => setPhoneVisible(true)}>

              <Text style={styles.rowText}>💬 וואטסאפ</Text>

            </Pressable>



            <Pressable style={styles.row} onPress={() => setVoiceVisible(true)}>

              <Text style={styles.rowText}>🎙 הקלטה קולית</Text>

            </Pressable>



            <Pressable style={styles.row} onPress={() => setNotebookVisible(true)}>

              <Text style={styles.rowText}>📷 סריקת מחברת</Text>

            </Pressable>



            <Pressable style={styles.row} onPress={() => setTextVisible(true)}>

              <Text style={styles.rowText}>✏️ קליטת טקסט</Text>

            </Pressable>



            <Pressable

              style={styles.row}

              onPress={() => void connectCalendar()}

              disabled={calendarLinked}

            >

              <Text style={styles.rowText}>

                {calendarLinked ? "📅 יומן מחובר" : "📅 Google Calendar"}

              </Text>

            </Pressable>



            <Pressable style={styles.row} onPress={() => setPremiumVisible(true)}>

              <Text style={styles.rowText}>

                {summary?.isPremium ? "⭐ Premium פעיל" : "⭐ Premium"}

              </Text>

            </Pressable>



            <Pressable style={styles.row} onPress={() => setTagsVisible(true)}>

              <Text style={styles.rowText}>🏷 ניהול תגיות</Text>

            </Pressable>



            <Pressable style={styles.row} onPress={() => setBoardsVisible(true)}>

              <Text style={styles.rowText}>📋 הגדרות בורדים</Text>

            </Pressable>



            <Pressable style={styles.row} onPress={() => setTrashVisible(true)}>

              <Text style={styles.rowText}>🗑 סל מחזור</Text>

            </Pressable>



            {isDemoMode ? (
              <Pressable style={styles.row} onPress={() => setTestDataVisible(true)}>
                <Text style={styles.rowText}>🧪 נתוני בדיקה</Text>
              </Pressable>
            ) : null}



            <Pressable style={styles.close} onPress={onClose}>

              <Text style={styles.closeText}>סגור</Text>

            </Pressable>

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

              <Text style={[styles.profileEmail, { textAlign: "left" }]}>

                {profile.email}

              </Text>

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



      <TagSettingsScreen

        visible={tagsVisible}

        tags={userTags}

        onSave={onSaveTags}

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

      <TrashScreen visible={trashVisible} onClose={() => setTrashVisible(false)} />

      <BoardSettingsScreen visible={boardsVisible} onClose={() => setBoardsVisible(false)} />

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

  },

  title: { fontSize: 18, fontWeight: "800", textAlign: "right", marginBottom: 16 },

  row: {

    paddingVertical: 14,

    borderBottomWidth: 1,

    borderBottomColor: "#f1f5f9",

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

