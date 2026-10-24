import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";

import { isSupabaseConfigured, requireSupabase } from "../lib/supabase";
import { clearAllConvexUserCaches } from "../lib/convex-user-cache";

export const BABITK_PRIVACY_URL = "https://erezbabayan.github.io/BabiTk/privacy.html";
export const BABITK_TERMS_URL = "https://erezbabayan.github.io/BabiTk/terms.html";

export const DELETE_ACCOUNT_CONFIRM =
  "למחוק את החשבון וכל הנתונים? הפעולה לא ניתנת לביטול.";

async function invokeAccount(action: "export" | "delete"): Promise<unknown> {
  const { data, error } = await requireSupabase().functions.invoke("account", {
    body: { action },
  });
  if (error) throw error;
  return data;
}

async function saveExport(json: string): Promise<boolean> {
  const fileName = `babitk-export-${new Date().toISOString().slice(0, 10)}`;
  if (Platform.OS === "android") {
    const saf = FileSystem.StorageAccessFramework;
    const perm = await saf.requestDirectoryPermissionsAsync();
    if (!perm.granted) return false;
    const uri = await saf.createFileAsync(
      perm.directoryUri,
      fileName,
      "application/json",
    );
    await FileSystem.writeAsStringAsync(uri, json, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return true;
  }
  const path = `${FileSystem.cacheDirectory ?? ""}${fileName}.json`;
  await FileSystem.writeAsStringAsync(path, json, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await Share.share({ url: path, title: fileName });
  return true;
}

export function AccountDataSection() {
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isSupabaseConfigured) return null;

  async function handleExport() {
    setBusy("export");
    setMessage(null);
    setError(null);
    try {
      const data = await invokeAccount("export");
      const saved = await saveExport(JSON.stringify(data, null, 2));
      if (saved) setMessage("הקובץ הורד.");
    } catch {
      setError("הייצוא נכשל");
    } finally {
      setBusy(null);
    }
  }

  async function runDelete() {
    setBusy("delete");
    setMessage(null);
    setError(null);
    try {
      await invokeAccount("delete");
      await clearAllConvexUserCaches();
      await requireSupabase().auth.signOut({ scope: "local" });
    } catch {
      setError("מחיקת החשבון נכשלה");
      setBusy(null);
    }
  }

  function handleDelete() {
    Alert.alert("מחק חשבון", DELETE_ACCOUNT_CONFIRM, [
      { text: "ביטול", style: "cancel" },
      {
        text: "מחק חשבון",
        style: "destructive",
        onPress: () => void runDelete(),
      },
    ]);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.title}>נתונים וחשבון</Text>
      <Text style={styles.description}>
        ייצוא מוריד JSON של הפריטים והפרופיל. מחיקה מוחקת את החשבון וכל הנתונים.
      </Text>
      <View style={styles.row}>
        <Pressable
          style={styles.button}
          disabled={busy !== null}
          onPress={() => void handleExport()}
        >
          {busy === "export" ? (
            <ActivityIndicator color="#4f46e5" />
          ) : (
            <Text style={styles.buttonText}>ייצוא הנתונים שלי</Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.button, styles.danger]}
          disabled={busy !== null}
          onPress={handleDelete}
        >
          {busy === "delete" ? (
            <ActivityIndicator color="#dc2626" />
          ) : (
            <Text style={[styles.buttonText, styles.dangerText]}>
              מחק חשבון
            </Text>
          )}
        </Pressable>
      </View>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.legalRow}>
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(BABITK_PRIVACY_URL)}>
          <Text style={styles.legalLink}>מדיניות פרטיות</Text>
        </Pressable>
        <Text style={styles.description}>·</Text>
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(BABITK_TERMS_URL)}>
          <Text style={styles.legalLink}>תנאי שימוש</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 16, gap: 8 },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "right",
  },
  description: { fontSize: 13, color: "#64748b", textAlign: "right" },
  row: { flexDirection: "row-reverse", gap: 8 },
  button: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#c7d2fe",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  buttonText: { color: "#4f46e5", fontWeight: "600" },
  danger: { borderColor: "#fecaca" },
  dangerText: { color: "#dc2626" },
  message: { color: "#16a34a", textAlign: "right" },
  error: { color: "#dc2626", textAlign: "right" },
  legalRow: { flexDirection: "row-reverse", gap: 8, alignItems: "center" },
  legalLink: { fontSize: 13, color: "#4f46e5", textDecorationLine: "underline" },
});
