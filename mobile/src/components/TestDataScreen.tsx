import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { buildDemoTestItems } from "../lib/demo-seed-data";
import { clearDemoItems, clearDemoSeedItems, seedDemoTestData } from "../lib/demo-store";

interface TestDataScreenProps {
  visible: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export function TestDataScreen({ visible, onClose, onChanged }: TestDataScreenProps) {
  const [loading, setLoading] = useState(false);
  const sampleCount = buildDemoTestItems().length;

  async function handleSeed() {
    setLoading(true);
    try {
      const result = await seedDemoTestData();
      onChanged();
      if (result.added === 0) {
        Alert.alert("נתוני בדיקה", "כל פריטי הדוגמה כבר קיימים.");
      } else {
        Alert.alert(
          "נתוני בדיקה",
          `נוספו ${result.added} פריטים${result.skipped > 0 ? ` (${result.skipped} כבר היו)` : ""}.`,
        );
      }
    } catch (err) {
      Alert.alert("שגיאה", err instanceof Error ? err.message : "טעינה נכשלה");
    } finally {
      setLoading(false);
    }
  }

  function confirmClearSeed() {
    Alert.alert("מחיקת דוגמאות", "למחוק רק את פריטי הבדיקה (test-seed)?", [
      { text: "ביטול", style: "cancel" },
      {
        text: "מחק דוגמאות",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setLoading(true);
            try {
              const removed = await clearDemoSeedItems();
              onChanged();
              Alert.alert("נמחק", removed > 0 ? `${removed} פריטי דוגמה הוסרו.` : "לא נמצאו פריטי דוגמה.");
            } catch (err) {
              Alert.alert("שגיאה", err instanceof Error ? err.message : "מחיקה נכשלה");
            } finally {
              setLoading(false);
            }
          })();
        },
      },
    ]);
  }

  function confirmClearAll() {
    Alert.alert("מחיקת הכל", "למחוק את כל הפריטים באפליקציה?", [
      { text: "ביטול", style: "cancel" },
      {
        text: "מחק הכל",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setLoading(true);
            try {
              await clearDemoItems();
              onChanged();
              Alert.alert("נמחק", "כל הפריטים הוסרו.");
            } catch (err) {
              Alert.alert("שגיאה", err instanceof Error ? err.message : "מחיקה נכשלה");
            } finally {
              setLoading(false);
            }
          })();
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>נתוני בדיקה</Text>
          <Text style={styles.body}>
            טען {sampleCount} פריטי דוגמה לכל הבורדים: המחברת, משימות, הערות, ארכיון ובוצעו.
            {"\n"}ניתן גם להוסיף ידנית דרך שורת הקליטה המהירה.
          </Text>

          <Pressable
            style={[styles.primaryBtn, loading && styles.disabled]}
            onPress={() => void handleSeed()}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>טען נתוני דוגמה</Text>
            )}
          </Pressable>

          <Pressable
            style={[styles.secondaryBtn, loading && styles.disabled]}
            onPress={confirmClearSeed}
            disabled={loading}
          >
            <Text style={styles.secondaryBtnText}>מחק רק דוגמאות</Text>
          </Pressable>

          <Pressable
            style={[styles.dangerBtn, loading && styles.disabled]}
            onPress={confirmClearAll}
            disabled={loading}
          >
            <Text style={styles.dangerBtnText}>מחק את כל הפריטים</Text>
          </Pressable>

          <Pressable style={styles.close} onPress={onClose} disabled={loading}>
            <Text style={styles.closeText}>סגור</Text>
          </Pressable>
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
  },
  title: { fontSize: 18, fontWeight: "800", textAlign: "right", marginBottom: 10 },
  body: {
    fontSize: 14,
    color: "#475569",
    textAlign: "right",
    lineHeight: 21,
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: "#334155",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  secondaryBtnText: { color: "#334155", fontWeight: "600", fontSize: 14 },
  dangerBtn: {
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    marginBottom: 8,
  },
  dangerBtnText: { color: "#b91c1c", fontWeight: "600", fontSize: 14 },
  close: { marginTop: 8, alignItems: "center" },
  closeText: { color: "#64748b", fontSize: 15 },
  disabled: { opacity: 0.6 },
});
