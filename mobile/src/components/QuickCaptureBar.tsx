import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Audio } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { ingestText, uploadNotebookOcr, uploadVoiceNote, isPaywallError } from "../lib/api";
import { parseCaptureText } from "../lib/capture-parse";
import { isSyncEnabled } from "../lib/sync-client";
import { isDemoMode, type MindtaskerItem } from "../lib/supabase";
import { MindTaskerLogo } from "./MindTaskerLogo";

interface QuickCaptureBarProps {
  onAddItem: (item: MindtaskerItem) => Promise<void>;
  onAfterCapture?: () => void | Promise<void>;
}

function demoCaptureItem(
  title: string,
  content: string,
): MindtaskerItem {
  return {
    id: `cap-${Date.now()}`,
    title,
    content,
    is_actionable: true,
    status: "inbox",
    due_date: null,
    tags: [],
  } as MindtaskerItem;
}

export function QuickCaptureBar({ onAddItem, onAfterCapture }: QuickCaptureBarProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleTextSubmit() {
    const trimmed = text.trim();
    if (trimmed.length < 3) return;

    setLoading(true);
    try {
      if (isDemoMode && !isSyncEnabled()) {
        const parsed = parseCaptureText(trimmed);
        for (const item of parsed) {
          await onAddItem(item);
        }
      } else {
        await ingestText(trimmed);
        await onAfterCapture?.();
      }
      setText("");
    } catch (err) {
      Alert.alert("שגיאה", isPaywallError(err) ? err.message : "קליטה נכשלה");
    } finally {
      setLoading(false);
    }
  }

  async function handleScan() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("נדרשת הרשאה", "אפשר גישה למצלמה כדי לסרוק מחברת");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setLoading(true);
    try {
      if (isDemoMode) {
        await onAddItem(demoCaptureItem("סריקת מחברת", "פריט מסריקה (הדגמה)"));
      } else {
        await uploadNotebookOcr(result.assets[0].uri, result.assets[0].mimeType ?? "image/jpeg");
        await onAfterCapture?.();
      }
    } catch (err) {
      Alert.alert("שגיאה", err instanceof Error ? err.message : "סריקה נכשלה");
    } finally {
      setLoading(false);
    }
  }

  async function handleRecord() {
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("נדרשת הרשאה", "אפשר גישה למיקרופון להקלטה");
      return;
    }

    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await recording.startAsync();

    Alert.alert("מקליט...", "לחץ אישור כשסיימת", [
      {
        text: "סיום והעלאה",
        onPress: () => {
          void (async () => {
            setLoading(true);
            try {
              await recording.stopAndUnloadAsync();
              const uri = recording.getURI();
              if (!uri) throw new Error("הקלטה ריקה");

              if (isDemoMode) {
                await onAddItem(demoCaptureItem("הקלטה קולית", "פריט מהקלטה (הדגמה)"));
              } else {
                await uploadVoiceNote(uri);
                await onAfterCapture?.();
              }
            } catch (err) {
              Alert.alert("שגיאה", err instanceof Error ? err.message : "העלאה נכשלה");
            } finally {
              setLoading(false);
            }
          })();
        },
      },
      { text: "ביטול", style: "cancel" },
    ]);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.inputShell}>
          <Pressable
            style={[styles.logoBtn, (loading || text.trim().length < 3) && styles.logoBtnDisabled]}
            onPress={() => void handleTextSubmit()}
            disabled={loading || text.trim().length < 3}
            accessibilityLabel="קלוט"
            accessibilityRole="button"
            hitSlop={4}
          >
            {loading ? (
              <ActivityIndicator color="#334155" size="small" />
            ) : (
              <MindTaskerLogo size="capture" variant="mark" />
            )}
          </Pressable>
          <TextInput
            style={styles.input}
            placeholder="קליטה מהירה — טקסט או רעיון..."
            placeholderTextColor="#94a3b8"
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => void handleTextSubmit()}
            textAlign="right"
            editable={!loading}
          />
        </View>
        <View style={styles.tools}>
          <Pressable
            style={[styles.iconBtn, loading && styles.disabled]}
            onPress={() => void handleRecord()}
            disabled={loading}
            accessibilityLabel="הקלטה"
            accessibilityRole="button"
            hitSlop={4}
          >
            <Text style={styles.iconEmoji}>🎙</Text>
          </Pressable>
          <Pressable
            style={[styles.iconBtn, loading && styles.disabled]}
            onPress={() => void handleScan()}
            disabled={loading}
            accessibilityLabel="סריקת מחברת"
            accessibilityRole="button"
            hitSlop={4}
          >
            <Text style={styles.iconEmoji}>📷</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const BAR_HEIGHT = 40;
const LOGO_BTN_SIZE = 36;
const ICON_SIZE = 40;

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    marginBottom: 8,
  },
  row: {
    width: "100%",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  inputShell: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 999,
    backgroundColor: "#fff",
    minHeight: BAR_HEIGHT,
    padding: 2,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  logoBtn: {
    width: LOGO_BTN_SIZE,
    height: LOGO_BTN_SIZE,
    borderRadius: LOGO_BTN_SIZE / 2,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 1,
    elevation: 1,
  },
  logoBtnDisabled: { opacity: 0.45 },
  input: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 11,
    lineHeight: 16,
    minHeight: BAR_HEIGHT - 4,
    color: "#0f172a",
  },
  tools: {
    flexDirection: "row-reverse",
    alignItems: "center",
    flexShrink: 0,
    gap: 6,
  },
  iconBtn: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  iconEmoji: { fontSize: 17 },
  disabled: { opacity: 0.6 },
});
