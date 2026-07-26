import { useEffect, useState } from "react";
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
import Svg, { Path } from "react-native-svg";

import { allowDemoLogin, isSupabaseConfigured } from "../lib/supabase";
import { readRememberMe, readRememberedEmail } from "../lib/auth-storage";
import { DEMO_LOGIN_EMAIL } from "../lib/demo-store";
import { type SignupDetails, validateSignupDetails } from "../lib/signup-details";
import { BrandStripe } from "./BrandStripe";
import { MindTaskerLogo } from "./MindTaskerLogo";

type AuthMode = "login" | "signup";

interface LoginScreenProps {
  onSignIn: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  onSignUp?: (email: string, password: string, details: SignupDetails) => Promise<void>;
  onGoogleSignIn?: () => Promise<void>;
  onMicrosoftSignIn?: () => Promise<void>;
  onDemoEnter?: () => Promise<void>;
  allowSignup?: boolean;
  authSubtitle?: string;
  showLocalDemoHint?: boolean;
}

function EyeMark({ hidden }: { hidden: boolean }) {
  if (hidden) {
    return (
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
        <Path
          d="M3 3l18 18M10.58 10.58A2 2 0 0 0 12 15a2 2 0 0 0 1.42-.58M9.88 5.09A10.94 10.94 0 0 1 12 5c5 0 9.27 3.11 11 7.5a11.8 11.8 0 0 1-2.16 3.19M6.61 6.61A11.37 11.37 0 0 0 3 12.5C4.73 16.39 9 19.5 14 19.5c1.56 0 3.05-.32 4.4-.9"
          stroke="#64748b"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2 12.5C3.73 8.11 8 5 13 5s9.27 3.11 11 7.5c-1.73 4.39-6 7.5-11 7.5S3.73 16.89 2 12.5Z"
        stroke="#64748b"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M13 15.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="#64748b"
        strokeWidth={1.75}
      />
    </Svg>
  );
}

function GoogleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.56 2.95-2.26 5.48-4.78 7.18l7.73 6c4.51-4.16 7.09-10.27 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
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

export function LoginScreen({
  onSignIn,
  onSignUp,
  onGoogleSignIn,
  onMicrosoftSignIn,
  onDemoEnter,
  allowSignup = false,
  authSubtitle,
  showLocalDemoHint = false,
}: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const [savedEmail, savedRemember] = await Promise.all([
        readRememberedEmail(),
        readRememberMe(),
      ]);
      if (savedEmail) setEmail(savedEmail);
      setRememberMe(savedRemember);
    })();
  }, []);

  async function handleDemoEnter() {
    if (!onDemoEnter) return;
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      await onDemoEnter();
    } catch (err) {
      setError(err instanceof Error ? err.message : "כניסה לדמו נכשלה");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      if (authMode === "login") {
        await onSignIn(email.trim(), password, rememberMe);
      } else {
        if (!onSignUp) throw new Error("הרשמה לא זמינה");
        const details: SignupDetails = {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
        };
        validateSignupDetails(details, password);
        await onSignUp(email.trim(), password, details);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "התחברות נכשלה");
    } finally {
      setLoading(false);
    }
  }

  function toggleMode() {
    setAuthMode(authMode === "login" ? "signup" : "login");
    setFirstName("");
    setLastName("");
    setPhone("");
    setError(null);
    setMessage(null);
  }

  async function handleGoogleSignIn() {
    if (!onGoogleSignIn) return;
    setError(null);
    setMessage(null);
    setOauthLoading(true);
    try {
      await onGoogleSignIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "התחברות Google נכשלה");
    } finally {
      setOauthLoading(false);
    }
  }

  async function handleMicrosoftSignIn() {
    if (!onMicrosoftSignIn) return;
    setError(null);
    setMessage(null);
    setOauthLoading(true);
    try {
      await onMicrosoftSignIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "התחברות Microsoft נכשלה");
    } finally {
      setOauthLoading(false);
    }
  }

  const busy = loading || oauthLoading;

  const loginSubtitle =
    authSubtitle ??
    (showLocalDemoHint
      ? "התחברות למערכת (מצב פיתוח מקומי)"
      : onGoogleSignIn && authMode === "login"
        ? "התחבר עם חשבון Google שלך"
        : authMode === "login"
          ? "התחברות ללוח הבקרה"
          : "יצירת חשבון חדש");

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <LoginShell subtitle={loginSubtitle}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.success}>{message}</Text> : null}

        {onGoogleSignIn && authMode === "login" ? (
          <Pressable
            style={[styles.googleButton, busy && styles.buttonDisabled]}
            onPress={() => void handleGoogleSignIn()}
            disabled={busy}
          >
            {oauthLoading ? (
              <ActivityIndicator color="#1e293b" />
            ) : (
              <>
                <GoogleMark />
                <Text style={styles.googleButtonText}>התחבר עם Google</Text>
              </>
            )}
          </Pressable>
        ) : null}

        {onMicrosoftSignIn && authMode === "login" ? (
          <Pressable
            style={[styles.oauthButton, busy && styles.buttonDisabled]}
            onPress={() => void handleMicrosoftSignIn()}
            disabled={busy}
          >
            <Text style={styles.microsoftButtonText}>
              {oauthLoading ? "מתחבר..." : "התחבר עם Microsoft"}
            </Text>
          </Pressable>
        ) : null}

        {onGoogleSignIn && authMode === "login" ? (
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>או עם אימייל וסיסמה</Text>
            <View style={styles.dividerLine} />
          </View>
        ) : null}

        {authMode === "signup" ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="שם פרטי"
              placeholderTextColor="#94a3b8"
              autoCapitalize="words"
              textContentType="givenName"
              value={firstName}
              onChangeText={setFirstName}
              textAlign="right"
            />
            <TextInput
              style={styles.input}
              placeholder="שם משפחה"
              placeholderTextColor="#94a3b8"
              autoCapitalize="words"
              textContentType="familyName"
              value={lastName}
              onChangeText={setLastName}
              textAlign="right"
            />
            <TextInput
              style={styles.input}
              placeholder="050-1234567"
              placeholderTextColor="#94a3b8"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              value={phone}
              onChangeText={setPhone}
              textAlign="left"
            />
          </>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder={!isSupabaseConfigured ? DEMO_LOGIN_EMAIL : "you@example.com"}
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
          textAlign="left"
        />
        <View style={styles.passwordWrap}>
          <TextInput
            style={styles.passwordInput}
            placeholder="••••••••"
            placeholderTextColor="#94a3b8"
            secureTextEntry={!passwordVisible}
            textContentType="password"
            value={password}
            onChangeText={setPassword}
            textAlign="left"
          />
          <Pressable
            style={styles.passwordToggle}
            onPress={() => setPasswordVisible((v) => !v)}
            accessibilityLabel={passwordVisible ? "הסתר סיסמה" : "הצג סיסמה"}
          >
            <EyeMark hidden={passwordVisible} />
          </Pressable>
        </View>

        {authMode === "login" ? (
          <Pressable
            style={styles.rememberRow}
            onPress={() => setRememberMe((value) => !value)}
          >
            <View style={[styles.rememberBox, rememberMe && styles.rememberBoxChecked]}>
              {rememberMe ? <Text style={styles.rememberCheck}>✓</Text> : null}
            </View>
            <Text style={styles.rememberLabel}>זכור אותי במכשיר זה</Text>
          </Pressable>
        ) : null}

        <Pressable
          style={[styles.primaryButton, busy && styles.buttonDisabled]}
          onPress={() => void handleSubmit()}
          disabled={busy}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {authMode === "login" ? "התחבר" : "הירשם"}
            </Text>
          )}
        </Pressable>

        {onSignUp && (isSupabaseConfigured || allowSignup) ? (
          <Pressable onPress={toggleMode} style={styles.toggleMode}>
            <Text style={styles.toggleModeText}>
              {authMode === "login" ? "אין חשבון? הירשם" : "יש לך חשבון? התחבר"}
            </Text>
          </Pressable>
        ) : null}

        {showLocalDemoHint ? (
          <Text style={styles.demoHint}>
            התחברות מקומית: {DEMO_LOGIN_EMAIL} / demo
          </Text>
        ) : null}

        {allowDemoLogin && onDemoEnter ? (
          <Pressable
            style={[styles.demoButton, busy && styles.buttonDisabled]}
            onPress={() => void handleDemoEnter()}
            disabled={busy}
          >
            <Text style={styles.demoButtonText}>כניסה מהירה לדמו</Text>
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
  passwordWrap: {
    position: "relative",
    justifyContent: "center",
  },
  passwordInput: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingLeft: 14,
    paddingRight: 38,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: "#fff",
  },
  passwordToggle: {
    position: "absolute",
    right: 10,
    padding: 4,
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
  rememberRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-end",
  },
  rememberBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  rememberBoxChecked: {
    borderColor: "#4f46e5",
    backgroundColor: "#eef2ff",
  },
  rememberCheck: { color: "#4f46e5", fontSize: 12, fontWeight: "700", lineHeight: 14 },
  rememberLabel: { color: "#64748b", fontSize: 13 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#e2e8f0" },
  dividerText: { color: "#94a3b8", fontSize: 12 },
  googleButton: {
    flexDirection: "row",
    gap: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  oauthButton: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  googleButtonText: { color: "#1e293b", fontWeight: "700", fontSize: 15 },
  microsoftButtonText: { color: "#1e293b", fontWeight: "700", fontSize: 15 },
  demoHint: {
    color: "#64748b",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  demoButton: {
    borderWidth: 1,
    borderColor: "#c7d2fe",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#eef2ff",
  },
  demoButtonText: { color: "#4338ca", fontWeight: "600", fontSize: 14 },
  tagline: {
    marginTop: 16,
    textAlign: "center",
    color: "#94a3b8",
    fontSize: 12,
  },
});
