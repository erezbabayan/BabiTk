import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { changePasswordWithSupabase } from "../lib/change-password";
import { isSupabaseConfigured, requireSupabase } from "../lib/supabase";

interface ChangePasswordSectionProps {
  email: string;
}

export function ChangePasswordSection({ email }: ChangePasswordSectionProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!isSupabaseConfigured) {
    return null;
  }

  async function handleSubmit() {
    setError(null);
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setError("הסיסמאות החדשות אינן תואמות");
      return;
    }

    setLoading(true);
    try {
      await changePasswordWithSupabase(
        requireSupabase(),
        email,
        currentPassword,
        newPassword,
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("הסיסמה עודכנה בהצלחה");
    } catch (err) {
      setError(err instanceof Error ? err.message : "עדכון הסיסמה נכשל");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>שינוי סיסמה</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}

      <TextInput
        style={styles.input}
        placeholder="סיסמה נוכחית"
        placeholderTextColor="#94a3b8"
        secureTextEntry
        value={currentPassword}
        onChangeText={setCurrentPassword}
        textAlign="left"
      />
      <TextInput
        style={styles.input}
        placeholder="סיסמה חדשה"
        placeholderTextColor="#94a3b8"
        secureTextEntry
        value={newPassword}
        onChangeText={setNewPassword}
        textAlign="left"
      />
      <TextInput
        style={styles.input}
        placeholder="אימות סיסמה חדשה"
        placeholderTextColor="#94a3b8"
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        textAlign="left"
      />

      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={() => void handleSubmit()}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#1e293b" />
        ) : (
          <Text style={styles.buttonText}>עדכן סיסמה</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, gap: 10 },
  title: { fontSize: 14, fontWeight: "700", color: "#0f172a", textAlign: "right" },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: "#fff",
  },
  button: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: "#1e293b", fontWeight: "700", fontSize: 14 },
  error: {
    color: "#b91c1c",
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 10,
    textAlign: "right",
    fontSize: 13,
  },
  success: {
    color: "#047857",
    backgroundColor: "#ecfdf5",
    borderRadius: 8,
    padding: 10,
    textAlign: "right",
    fontSize: 13,
  },
});
