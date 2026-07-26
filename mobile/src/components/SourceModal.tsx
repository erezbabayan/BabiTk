import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Audio } from "expo-av";
import { HighlightedNotebook } from "./HighlightedNotebook";
import type { MindtaskerItem } from "../lib/supabase";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { resolveItemSource } from "../lib/item-source";
import { displayForSourceType } from "../lib/source-display";

interface SourceModalProps {
  item: MindtaskerItem | null;
  visible: boolean;
  onClose: () => void;
}

export function SourceModal({ item, visible, onClose }: SourceModalProps) {
  const [loading, setLoading] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<string>("whatsapp_text");
  const [ocrLines, setOcrLines] = useState<
    { text: string; completed: boolean; bbox: { left: number; top: number; width: number; height: number } }[]
  >([]);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  const load = useCallback(async () => {
    if (!item) return;

    const embedded = item.source_materials;
    if (embedded) {
      setSourceType(embedded.source_type);
      setRawText(embedded.raw_text);
      setOcrLines((embedded.metadata as { ocr_lines?: typeof ocrLines })?.ocr_lines ?? []);
      setMediaUrl(null);
      setLoading(false);

      if (embedded.storage_url) {
        if (isSupabaseConfigured && supabase) {
          const { data: signed } = await supabase.storage
            .from("source-materials")
            .createSignedUrl(embedded.storage_url, 3600);
          setMediaUrl(signed?.signedUrl ?? null);
        } else if (/^https?:\/\//i.test(embedded.storage_url)) {
          setMediaUrl(embedded.storage_url);
        }
      }
      return;
    }

    const fallback = item.content?.trim() || item.title?.trim();
    if (!item.source_material_id || !isSupabaseConfigured || !supabase) {
      setSourceType("typed_text");
      setRawText(fallback || null);
      setOcrLines([]);
      setMediaUrl(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data } = await supabase
      .from("source_materials")
      .select("source_type, storage_url, raw_text, metadata")
      .eq("id", item.source_material_id)
      .single();

    if (data) {
      setSourceType(data.source_type);
      setRawText(data.raw_text);
      setOcrLines((data.metadata as { ocr_lines?: typeof ocrLines })?.ocr_lines ?? []);

      if (data.storage_url) {
        const { data: signed } = await supabase.storage
          .from("source-materials")
          .createSignedUrl(data.storage_url, 3600);
        setMediaUrl(signed?.signedUrl ?? null);
      }
    } else if (fallback) {
      setSourceType("typed_text");
      setRawText(fallback);
    }
    setLoading(false);
  }, [item]);

  useEffect(() => {
    if (visible) void load();
    else {
      void sound?.unloadAsync();
      setSound(null);
    }
  }, [visible, load]);

  useEffect(() => {
    return () => {
      void sound?.unloadAsync();
    };
  }, [sound]);

  async function playAudio() {
    if (!mediaUrl) return;
    await sound?.unloadAsync();
    const { sound: newSound } = await Audio.Sound.createAsync({ uri: mediaUrl });
    setSound(newSound);
    await newSound.playAsync();
  }

  if (!item) return null;

  const resolved = resolveItemSource(item);
  const isVoice = sourceType === "whatsapp_voice";
  const isImage = sourceType === "notebook_ocr" || sourceType === "image";

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose} accessibilityLabel="חזור ללוח">
            <Text style={styles.back}>← חזור</Text>
          </Pressable>
          <Text style={styles.title}>מקור המידע</Text>
          <Pressable onPress={onClose} accessibilityLabel="סגור">
            <Text style={styles.close}>סגור</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.itemTitle}>{item.title}</Text>
          <Text style={styles.sourceLabel}>
            {displayForSourceType(sourceType).icon} {resolved.label}
          </Text>

          {loading ? (
            <ActivityIndicator size="large" color="#2563eb" />
          ) : (
            <>
              {isVoice && mediaUrl ? (
                <Pressable style={styles.audioBtn} onPress={() => void playAudio()}>
                  <Text style={styles.audioBtnText}>▶ האזן להקלטה המקורית</Text>
                </Pressable>
              ) : isVoice ? (
                <Text style={styles.hint}>אין קובץ אודיו — מוצג התמלול בלבד.</Text>
              ) : null}

              {isImage && mediaUrl && ocrLines.length > 0 ? (
                <HighlightedNotebook uri={mediaUrl} lines={ocrLines} />
              ) : isImage && mediaUrl ? (
                <Text style={styles.hint}>תמונת מקור זמינה</Text>
              ) : null}

              {rawText ? (
                <View style={styles.rawBox}>
                  <Text style={styles.rawLabel}>טקסט מקורי / תמלול</Text>
                  <Text style={styles.rawText}>{rawText}</Text>
                </View>
              ) : (
                <Text style={styles.hint}>אין טקסט מקורי שמור.</Text>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingTop: 48 },
  header: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  title: { fontSize: 18, fontWeight: "700", flex: 1, textAlign: "center" },
  back: { color: "#2563eb", fontSize: 16, fontWeight: "600" },
  close: { color: "#64748b", fontSize: 14 },
  body: { padding: 20 },
  itemTitle: { fontSize: 16, fontWeight: "600", marginBottom: 8, textAlign: "right" },
  sourceLabel: { fontSize: 13, color: "#64748b", marginBottom: 16, textAlign: "right" },
  audioBtn: {
    backgroundColor: "#eff6ff",
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
  },
  audioBtnText: { color: "#1d4ed8", textAlign: "center", fontWeight: "600" },
  hint: { color: "#64748b", marginBottom: 12, textAlign: "right" },
  rawBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  rawLabel: { fontSize: 12, color: "#64748b", marginBottom: 6, textAlign: "right" },
  rawText: { fontSize: 14, color: "#334155", textAlign: "right", lineHeight: 22 },
});
