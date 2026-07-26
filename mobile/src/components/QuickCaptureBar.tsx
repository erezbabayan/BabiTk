import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import {
  formatCaptureError,
  ingestText,
  uploadNotebookOcr,
  uploadVoiceNote,
} from "../lib/api";
import { parseCaptureText } from "../lib/capture-parse";
import { isSyncEnabled } from "../lib/sync-client";
import { isDemoMode, type MindtaskerItem } from "../lib/supabase";
import { materializeLocalAudioUri } from "../lib/voice-upload";
import { MindTaskerLogo } from "./MindTaskerLogo";
import { NotebookIcon } from "./NotebookIcons";

/** Keep clips short enough for reliable upload + Whisper. */
const MAX_RECORD_SECONDS = 60;

interface QuickCaptureBarProps {
  userId?: string;
  onAddItem: (item: MindtaskerItem) => Promise<void>;
  onAfterCapture?: () => void | Promise<void>;
}

function demoCaptureItem(title: string, content: string): MindtaskerItem {
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

export function QuickCaptureBar({ userId, onAddItem, onAfterCapture }: QuickCaptureBarProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordSecondsRef = useRef(0);
  const stoppingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      const active = recordingRef.current;
      if (active) {
        void active.stopAndUnloadAsync().catch(() => undefined);
      }
    };
  }, []);

  function clearRecordTimer() {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  }

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
        await ingestText(trimmed, userId);
        await onAfterCapture?.();
      }
      setText("");
    } catch (err) {
      Alert.alert("שגיאה", formatCaptureError(err, "קליטה נכשלה"));
    } finally {
      setLoading(false);
    }
  }

  async function handleScan() {
    setLoading(true);
    try {
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

      if (isDemoMode && !isSyncEnabled()) {
        await onAddItem(demoCaptureItem("סריקת מחברת", "פריט מסריקה (הדגמה)"));
      } else {
        await uploadNotebookOcr(result.assets[0].uri, result.assets[0].mimeType ?? "image/jpeg", userId);
        await onAfterCapture?.();
      }
    } catch (err) {
      Alert.alert("שגיאה", formatCaptureError(err, "סריקה נכשלה"));
    } finally {
      setLoading(false);
    }
  }

  async function startDeviceRecording() {
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "נדרשת הרשאה",
        "אפשר גישה למיקרופון בהגדרות המכשיר כדי להקליט הודעות קוליות",
        [
          { text: "ביטול", style: "cancel" },
          {
            text: "פתח הגדרות",
            onPress: () => {
              void Linking.openSettings();
            },
          },
        ],
      );
      return;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    });

    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
    );
    recordingRef.current = recording;
    setIsRecording(true);
    recordSecondsRef.current = 0;
    setRecordSeconds(0);
    clearRecordTimer();
    recordTimerRef.current = setInterval(() => {
      const next = recordSecondsRef.current + 1;
      recordSecondsRef.current = next;
      setRecordSeconds(next);
      if (next >= MAX_RECORD_SECONDS) {
        void stopDeviceRecording(true);
      }
    }, 1000);
  }

  async function stopDeviceRecording(upload: boolean) {
    if (stoppingRef.current && upload) {
      // Auto-stop and manual stop can race; ignore the second upload attempt.
      return;
    }
    stoppingRef.current = true;

    const recording = recordingRef.current;
    recordingRef.current = null;
    const elapsedSeconds = recordSecondsRef.current;
    clearRecordTimer();
    setIsRecording(false);

    if (!recording) {
      recordSecondsRef.current = 0;
      setRecordSeconds(0);
      stoppingRef.current = false;
      return;
    }

    let uri: string | null = null;
    try {
      await recording.stopAndUnloadAsync();
      uri = recording.getURI();
    } catch {
      uri = recording.getURI();
    }

    await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => undefined);

    const durationForUpload = Math.max(1, elapsedSeconds || 1);
    recordSecondsRef.current = 0;
    setRecordSeconds(0);

    if (!upload) {
      stoppingRef.current = false;
      return;
    }
    if (!uri) {
      stoppingRef.current = false;
      Alert.alert("שגיאה", "ההקלטה ריקה");
      return;
    }

    setLoading(true);
    try {
      // Freeze the file in cache immediately after stop so unload/GC cannot delete it.
      const stableUri = await materializeLocalAudioUri(uri);

      if (isDemoMode && !isSyncEnabled()) {
        await onAddItem(demoCaptureItem("הקלטה קולית", "פריט מהקלטה (הדגמה)"));
      } else {
        await uploadVoiceNote(stableUri, userId, {
          durationSeconds: durationForUpload,
        });
        await onAfterCapture?.();
      }
    } catch (err) {
      const message = formatCaptureError(err, "העלאת ההקלטה נכשלה");
      Alert.alert("שגיאה בהקלטה", message);
    } finally {
      setLoading(false);
      stoppingRef.current = false;
    }
  }

  async function handleRecordPress() {
    if (loading || stoppingRef.current) return;
    try {
      if (isRecording) {
        await stopDeviceRecording(true);
      } else {
        stoppingRef.current = false;
        await startDeviceRecording();
      }
    } catch (err) {
      recordingRef.current = null;
      clearRecordTimer();
      setIsRecording(false);
      recordSecondsRef.current = 0;
      setRecordSeconds(0);
      stoppingRef.current = false;
      Alert.alert(
        "הקלטה נכשלה",
        err instanceof Error ? err.message : "לא ניתן להתחיל הקלטה מהמיקרופון",
      );
    }
  }

  const canSubmit = text.trim().length >= 3;
  const recordLabel =
    recordSeconds >= 60
      ? `${Math.floor(recordSeconds / 60)}:${String(recordSeconds % 60).padStart(2, "0")}`
      : `0:${String(recordSeconds).padStart(2, "0")}`;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.inputShell}>
          <Pressable
            style={[styles.submitBtn, (loading || !canSubmit || isRecording) && styles.submitBtnDisabled]}
            onPress={() => void handleTextSubmit()}
            disabled={loading || !canSubmit || isRecording}
            accessibilityLabel="קלוט"
            accessibilityRole="button"
            hitSlop={4}
          >
            {loading ? (
              <MindTaskerLogo size="capture" variant="mark" thinking />
            ) : (
              <>
                <NotebookIcon name="plus" size={15} tone="white" />
                <Text style={styles.submitLabel}>קלוט</Text>
              </>
            )}
          </Pressable>
          <View style={styles.inputCol}>
            <Text style={styles.kicker}>
              {isRecording ? `מקליט מהמיקרופון · ${recordLabel}` : "קליטה מהירה"}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="הוסף משימה, הערה או רעיון..."
              placeholderTextColor="#94a3b8"
              value={text}
              onChangeText={setText}
              onSubmitEditing={() => void handleTextSubmit()}
              textAlign="right"
              editable={!loading && !isRecording}
              accessibilityLabel="קליטה מהירה"
            />
          </View>
        </View>
        <View style={styles.tools}>
          <Pressable
            style={[
              styles.iconBtn,
              isRecording && styles.iconBtnRecording,
              loading && !isRecording && styles.disabled,
            ]}
            onPress={() => void handleRecordPress()}
            disabled={loading && !isRecording}
            accessibilityLabel={isRecording ? "עצור הקלטה והעלה" : "התחל הקלטה"}
            accessibilityRole="button"
            hitSlop={4}
          >
            {loading && !isRecording ? (
              <ActivityIndicator size="small" color="#334155" />
            ) : (
              <NotebookIcon name="mic" size={18} tone={isRecording ? "orange" : "slate"} />
            )}
          </Pressable>
          {isRecording ? (
            <Pressable
              style={styles.iconBtn}
              onPress={() => void stopDeviceRecording(false)}
              accessibilityLabel="בטל הקלטה"
              accessibilityRole="button"
              hitSlop={4}
            >
              <Text style={styles.cancelRecord}>✕</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.iconBtn, loading && styles.disabled]}
              onPress={() => void handleScan()}
              disabled={loading}
              accessibilityLabel="סריקת מחברת"
              accessibilityRole="button"
              hitSlop={4}
            >
              <NotebookIcon name="image" size={18} tone="slate" />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const BAR_HEIGHT = 48;
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
    gap: 8,
    borderWidth: 1,
    borderColor: "#d6d3d1",
    borderRadius: 12,
    backgroundColor: "#fff",
    minHeight: BAR_HEIGHT,
    paddingHorizontal: 8,
    paddingVertical: 6,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ea580c",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 36,
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitLabel: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  inputCol: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(234, 88, 12, 0.9)",
    textAlign: "right",
    marginBottom: 2,
  },
  input: {
    width: "100%",
    paddingVertical: 0,
    fontSize: 14,
    lineHeight: 18,
    color: "#1c1917",
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
  iconBtnRecording: {
    borderColor: "#ea580c",
    backgroundColor: "#fff7ed",
  },
  cancelRecord: {
    color: "#64748b",
    fontSize: 16,
    fontWeight: "700",
  },
  disabled: { opacity: 0.6 },
});
