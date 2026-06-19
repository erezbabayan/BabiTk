import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { isDemoMode } from "../lib/supabase";
import { BrandStripe } from "./BrandStripe";
import { MindTaskerLogo } from "./MindTaskerLogo";

type AuthMode = "login" | "signup";

interface LoginScreenProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp?: (email: string, password: string) => Promise<void>;
  onDemoEnter?: () => Promise<void>;
}

function LoginShell({
  subtitle,
  children,
}: {
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.shell}>
      <View style={styles.bgOrbTop} />
      <View style={styles.bgOrbBottom} />

      <View style={styles.cardWrap}>
        <View style={styles.card}>
          <BrandStripe />
          <View style={styles.cardBody}>
            <View style={styles.logoBlock}>
              <MindTaskerLogo size="large" />
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            {children}
          </View>
        </View>
        <Text style={styles.tagline}>ארגן משימות, הערות ומחברות — במקום אחד</Text>
      </View>
    </View>
  );
}

export function LoginScreen({ onSignIn, onSignUp, onDemoEnter }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      if (authMode === "login") {
        await onSignIn(email.trim(), password);
      } else {
        if (!onSignUp) throw new Error("הרשמה לא זמינה");
        await onSignUp(email.trim(), password);
        setMessage("נרשמת בהצלחה. בדוק את האימייל לאימות (אם נדרש) ואז התחבר.");
        setAuthMode("login");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "התחברות נכשלה");
    } finally {
      setLoading(false);
    }
  }

  function toggleMode() {
    setAuthMode(authMode === "login" ? "signup" : "login");
    setError(null);
    setMessage(null);
  }

  if (isDemoMode && onDemoEnter) {
    return (
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <LoginShell subtitle="מצב הדגמה מקומי — ללא Supabase">
          <Pressable
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={() => void onDemoEnter()}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>כניסה למערכת</Text>
            )}
          </Pressable>
        </LoginShell>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <LoginShell subtitle={authMode === "login" ? "התחברות ללוח הבקרה" : "יצירת חשבון חדש"}>
        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
          textAlign="left"
        />
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor="#94a3b8"
          secureTextEntry
          textContentType="password"
          value={password}
          onChangeText={setPassword}
          textAlign="left"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.success}>{message}</Text> : null}

        <Pressable
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={() => void handleSubmit()}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {authMode === "login" ? "התחבר" : "הירשם"}
            </Text>
          )}
        </Pressable>

        {onSignUp ? (
          <Pressable onPress={toggleMode} style={styles.toggleMode}>
            <Text style={styles.toggleModeText}>
              {authMode === "login" ? "אין חשבון? הירשם" : "יש לך חשבון? התחבר"}
            </Text>
          </Pressable>
        ) : null}
      </LoginShell>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f1f5f9" },
  shell: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#f8fafc",
  },
  bgOrbTop: {
    position: "absolute",
    top: -80,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(199, 210, 254, 0.45)",
  },
  bgOrbBottom: {
    position: "absolute",
    bottom: -100,
    left: -50,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(167, 243, 208, 0.35)",
  },
  cardWrap: { width: "100%", maxWidth: 400, alignSelf: "center" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.8)",
  },
  cardBody: { padding: 24, gap: 16 },
  logoBlock: { alignItems: "center", gap: 8 },
  subtitle: { color: "#64748b", fontSize: 14, textAlign: "center" },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: "#fff",
  },
  error: {
    color: "#b91c1c",
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 10,
    textAlign: "right",
    fontSize: 14,
  },
  success: {
    color: "#047857",
    backgroundColor: "#ecfdf5",
    borderRadius: 8,
    padding: 10,
    textAlign: "right",
    fontSize: 14,
  },
  toggleMode: { alignItems: "center", paddingVertical: 4 },
  toggleModeText: { color: "#64748b", fontSize: 14 },
  primaryButton: {
    backgroundColor: "#4f46e5",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.65 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  tagline: {
    marginTop: 16,
    textAlign: "center",
    color: "#94a3b8",
    fontSize: 12,
  },
});
