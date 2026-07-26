import { useEffect, useState, type ComponentType } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import {
  useAuthActions,
  useAuthToken,
  useConvexAuth,
} from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { ConvexHttpClient } from "convex/browser";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  Rubik_500Medium,
  Rubik_600SemiBold,
  Rubik_700Bold,
} from "@expo-google-fonts/rubik";
import { SecularOne_400Regular } from "@expo-google-fonts/secular-one";
import { Solitreo_400Regular } from "@expo-google-fonts/solitreo";
import { useFonts } from "expo-font";

import { api } from "../../../convex/_generated/api";
import { LoginScreen } from "../components/LoginScreen";
import {
  applyRememberMePreference,
  clearCachedAuthUserId,
  clearConvexAuthTokens,
  persistLoginDetails,
  readCachedAuthUserId,
  readConvexAuthJwt,
  writeCachedAuthUserId,
} from "../lib/auth-storage";
import { formatConvexAuthError } from "../lib/auth-errors";
import { clearAllConvexUserCaches } from "../lib/convex-user-cache";
import { decodeConvexAuthUserIdFromJwt } from "../lib/convex-jwt";
import {
  persistPasswordAuthTokens,
  signInWithPasswordViaHttp,
} from "../lib/convex-password-auth";
import { type SignupDetails } from "../lib/signup-details";

type MainAppComponent = ComponentType<{
  onSignOut: () => void;
  userId: string;
  userEmail?: string | null;
}>;

interface ConvexAuthGateProps {
  MainApp: MainAppComponent;
}

function LoadingScreen({ message }: { message?: string }) {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#f8fafc",
        padding: 24,
      }}
    >
      <ActivityIndicator size="large" color="#4f46e5" />
      {message ? (
        <Text style={{ marginTop: 16, color: "#64748b", textAlign: "center" }}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

export function ConvexAuthGate({ MainApp }: ConvexAuthGateProps) {
  const { isLoading, isAuthenticated, fetchAccessToken } = useConvexAuth();
  const authToken = useAuthToken();
  const { signOut } = useAuthActions();
  const viewer = useQuery(api.users.viewer);
  const [cachedUserId, setCachedUserId] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [enteringApp, setEnteringApp] = useState(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [fontsLoaded, fontError] = useFonts({
    Rubik_500Medium,
    Rubik_600SemiBold,
    Rubik_700Bold,
    SecularOne_400Regular,
    Solitreo: Solitreo_400Regular,
    Solitreo_400Regular,
  });

  const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL?.trim() ?? "";

  useEffect(() => {
    void readCachedAuthUserId().then((id) => {
      setCachedUserId(id);
      setBootstrapped(true);
    });
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      setEnteringApp(true);
      setLoadTimedOut(false);
      setBootstrapError(null);
    } else if (!isLoading) {
      setEnteringApp(false);
    }
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    if (viewer?.userId) {
      void writeCachedAuthUserId(viewer.userId);
      setCachedUserId(viewer.userId);
    }
  }, [viewer?.userId]);

  useEffect(() => {
    if (!isAuthenticated && !isLoading && bootstrapped) {
      void clearCachedAuthUserId();
      setCachedUserId(null);
    }
  }, [isAuthenticated, isLoading, bootstrapped]);

  const userId = viewer?.userId ?? cachedUserId;
  const inApp =
    isAuthenticated || enteringApp || (isLoading && Boolean(cachedUserId));
  const profileMissing =
    isAuthenticated && viewer === null && Boolean(authToken) && !cachedUserId;
  const viewerLoading =
    isAuthenticated && viewer === undefined && !cachedUserId;

  // React Native: bootstrap profile over HTTP when the live query is slow.
  useEffect(() => {
    if (!isAuthenticated || userId || !authToken || !convexUrl) return;

    let cancelled = false;
    void (async () => {
      try {
        const fromJwt = await cacheUserIdFromToken(authToken);
        if (cancelled || fromJwt) return;

        const client = new ConvexHttpClient(convexUrl);
        client.setAuth(authToken);
        const authId = await client.query(api.users.authUserId, {});
        if (cancelled) return;
        if (authId) {
          await writeCachedAuthUserId(authId);
          setCachedUserId(authId);
          setBootstrapError(null);
          return;
        }
        const profile = await client.query(api.users.viewer, {});
        if (cancelled) return;
        if (profile?.userId) {
          await writeCachedAuthUserId(profile.userId);
          setCachedUserId(profile.userId);
          setBootstrapError(null);
          return;
        }
        setBootstrapError("לא נמצא פרופיל משתמש ב-Convex");
      } catch (error) {
        if (!cancelled) {
          setBootstrapError(
            error instanceof Error ? error.message : "טעינת החשבון נכשלה",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, userId, authToken, convexUrl]);

  useEffect(() => {
    if (!inApp || userId) {
      setLoadTimedOut(false);
      return;
    }

    const timer = setTimeout(() => setLoadTimedOut(true), 12000);
    return () => clearTimeout(timer);
  }, [inApp, userId, bootstrapAttempt]);

  async function cacheUserIdFromToken(token: string | null): Promise<string | null> {
    if (!token) return null;

    const fromJwt = decodeConvexAuthUserIdFromJwt(token);
    if (fromJwt) {
      await writeCachedAuthUserId(fromJwt);
      setCachedUserId(fromJwt);
      setBootstrapError(null);
      return fromJwt;
    }

    return null;
  }

  async function bootstrapProfileFromToken(): Promise<string | null> {
    if (!convexUrl) return null;

    let token: string | null = authToken;
    for (let attempt = 0; attempt < 15; attempt++) {
      token =
        token ??
        (await fetchAccessToken({ forceRefreshToken: attempt >= 10 })) ??
        (await readConvexAuthJwt());
      if (token) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!token) return null;

    const fromJwt = await cacheUserIdFromToken(token);
    if (fromJwt) return fromJwt;

    const client = new ConvexHttpClient(convexUrl);
    client.setAuth(token);
    const authId = await client.query(api.users.authUserId, {});
    if (authId) {
      await writeCachedAuthUserId(authId);
      setCachedUserId(authId);
      setBootstrapError(null);
      return authId;
    }

    const profile = await client.query(api.users.viewer, {});
    if (!profile?.userId) return null;

    await writeCachedAuthUserId(profile.userId);
    setCachedUserId(profile.userId);
    setBootstrapError(null);
    return profile.userId;
  }

  async function completeAuthAfterSignIn(authMode: "login" | "signup"): Promise<void> {
    setEnteringApp(true);

    const token =
      (await fetchAccessToken({ forceRefreshToken: false })) ??
      (await readConvexAuthJwt()) ??
      authToken;
    const user = (await cacheUserIdFromToken(token)) ?? (await bootstrapProfileFromToken());
    if (user) return;

    setBootstrapError(
      authMode === "signup"
        ? "ההרשמה הצליחה — ממתין לטעינת החשבון. נסה «נסה שוב» או המתן רגע."
        : "ההתחברות הצליחה — ממתין לטעינת החשבון. נסה «נסה שוב» או המתן רגע.",
    );
  }

  async function establishPasswordSession(
    params: Parameters<typeof signInWithPasswordViaHttp>[1],
  ): Promise<string> {
    if (!convexUrl) {
      throw new Error("Convex לא מוגדר");
    }

    await signOut().catch(() => {});
    await clearConvexAuthTokens();
    await clearCachedAuthUserId();
    setCachedUserId(null);

    const tokens = await signInWithPasswordViaHttp(convexUrl, params);
    await persistPasswordAuthTokens(tokens.token, tokens.refreshToken);

    const accessToken = await fetchAccessToken({ forceRefreshToken: true });
    const jwt = accessToken ?? tokens.token;
    const user = (await cacheUserIdFromToken(jwt)) ?? decodeConvexAuthUserIdFromJwt(jwt);
    if (user) return user;

    const bootstrapped = await bootstrapProfileFromToken();
    if (bootstrapped) return bootstrapped;

    throw new Error("ההתחברות הצליחה אך טעינת החשבון נכשלה");
  }

  async function handleSignIn(
    email: string,
    password: string,
    rememberMe = true,
  ) {
    setBootstrapError(null);
    const normalizedEmail = email.trim().toLowerCase();
    await applyRememberMePreference(rememberMe, normalizedEmail);
    setEnteringApp(true);

    try {
      await establishPasswordSession({
        email: normalizedEmail,
        password,
        flow: "signIn",
      });
      await persistLoginDetails(rememberMe, normalizedEmail);
      await completeAuthAfterSignIn("login");
    } catch (error) {
      setEnteringApp(false);
      throw new Error(formatConvexAuthError(error, "login"));
    }
  }

  async function handleSignUp(
    email: string,
    password: string,
    details: SignupDetails,
  ) {
    setBootstrapError(null);
    const normalizedEmail = email.trim().toLowerCase();
    await applyRememberMePreference(true, normalizedEmail);
    setEnteringApp(true);

    try {
      await establishPasswordSession({
        email: normalizedEmail,
        password,
        flow: "signUp",
        firstName: details.firstName,
        lastName: details.lastName,
        phone: details.phone,
      });
      await persistLoginDetails(true, normalizedEmail);
      await completeAuthAfterSignIn("signup");
    } catch (error) {
      setEnteringApp(false);
      throw new Error(formatConvexAuthError(error, "signup"));
    }
  }

  async function handleSignOut() {
    await clearAllConvexUserCaches();
    await clearConvexAuthTokens();
    await clearCachedAuthUserId();
    setCachedUserId(null);
    setEnteringApp(false);
    setLoadTimedOut(false);
    setBootstrapError(null);
    await signOut();
  }

  if (!bootstrapped || (!fontsLoaded && !fontError)) {
    return <LoadingScreen message="טוען..." />;
  }

  if (isLoading && !cachedUserId && !isAuthenticated && !enteringApp) {
    return <LoadingScreen message="בודק התחברות..." />;
  }

  if (!inApp) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <GestureHandlerRootView style={{ flex: 1 }}>
          <LoginScreen
            allowSignup
            authSubtitle="התחבר עם חשבון קיים או הירשם"
            onSignIn={handleSignIn}
            onSignUp={handleSignUp}
          />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    );
  }

  if ((profileMissing || bootstrapError) && !userId) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            padding: 24,
            backgroundColor: "#f8fafc",
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: "700",
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            לא הצלחנו לטעון את החשבון
          </Text>
          <Text style={{ color: "#64748b", textAlign: "center", marginBottom: 20 }}>
            {bootstrapError ??
              "ההתחברות הצליחה אבל הפרופיל לא נטען. בדוק חיבור לאינטרנט ונסה שוב."}
          </Text>
          <Pressable
            style={{
              alignSelf: "center",
              backgroundColor: "#4f46e5",
              paddingHorizontal: 20,
              paddingVertical: 12,
              borderRadius: 10,
              marginBottom: 12,
            }}
            onPress={() => {
              setBootstrapError(null);
              setLoadTimedOut(false);
              setBootstrapAttempt((n) => n + 1);
              void bootstrapProfileFromToken().catch((error) => {
                setBootstrapError(
                  error instanceof Error ? error.message : "טעינת הפרופיל נכשלה",
                );
              });
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>נסה שוב</Text>
          </Pressable>
          <Pressable
            style={{
              alignSelf: "center",
              paddingHorizontal: 20,
              paddingVertical: 12,
            }}
            onPress={() => void handleSignOut()}
          >
            <Text style={{ color: "#64748b", fontWeight: "600" }}>
              חזרה להתחברות
            </Text>
          </Pressable>
        </View>
      </SafeAreaProvider>
    );
  }

  if (!userId) {
    if (loadTimedOut) {
      return (
        <SafeAreaProvider>
          <StatusBar style="dark" />
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              padding: 24,
              backgroundColor: "#f8fafc",
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              הטעינה נמשכת יותר מדי
            </Text>
            <Text style={{ color: "#64748b", textAlign: "center", marginBottom: 20 }}>
              בדוק חיבור Wi‑Fi וש-Convex זמין, ואז נסה שוב.
            </Text>
            <Pressable
              style={{
                alignSelf: "center",
                backgroundColor: "#4f46e5",
                paddingHorizontal: 20,
                paddingVertical: 12,
                borderRadius: 10,
                marginBottom: 12,
              }}
              onPress={() => {
                setLoadTimedOut(false);
                setBootstrapError(null);
                setBootstrapAttempt((n) => n + 1);
                void bootstrapProfileFromToken().catch((error) => {
                  setBootstrapError(
                    error instanceof Error ? error.message : "טעינת הפרופיל נכשלה",
                  );
                });
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>נסה שוב</Text>
            </Pressable>
            <Pressable
              style={{
                alignSelf: "center",
                paddingHorizontal: 20,
                paddingVertical: 12,
              }}
              onPress={() => void handleSignOut()}
            >
              <Text style={{ color: "#64748b", fontWeight: "600" }}>
                חזרה להתחברות
              </Text>
            </Pressable>
          </View>
        </SafeAreaProvider>
      );
    }

    return (
      <LoadingScreen
        message={viewerLoading ? "טוען את החשבון שלך..." : "מתחבר..."}
      />
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <GestureHandlerRootView style={{ flex: 1 }}>
        <MainApp
          onSignOut={() => void handleSignOut()}
          userId={userId}
          userEmail={viewer?.email}
        />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
