import { StrictMode, Suspense, lazy, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { SplashScreen } from "./components/SplashScreen";
import { BoardItemViewProvider } from "./providers/BoardItemViewProvider";
import { ConvexAppProvider } from "./providers/ConvexAppProvider";
import "./index.css";

const CHUNK_RELOAD_KEY = "babitk:chunk-reload";

function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return /Failed to fetch dynamically imported module|Loading chunk|Importing a module script failed|error loading dynamically imported module/i.test(
    msg,
  );
}

const App = lazy(() =>
  import("./App").catch((error: unknown) => {
    // Stale cached chunk after deploy — force a hard navigation once.
    if (isChunkLoadError(error) && !sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
      const url = new URL(window.location.href);
      url.searchParams.set("_r", String(Date.now()));
      window.location.replace(url.toString());
      return new Promise(() => undefined) as Promise<{
        default: typeof import("./App").default;
      }>;
    }
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    throw error instanceof Error ? error : new Error(String(error));
  }),
);

function BootError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        textAlign: "center",
        background: "#f5f2e9",
        color: "#1c1917",
        fontFamily: "Rubik, Segoe UI, Tahoma, Arial, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>לא ניתן לטעון את BabiTk</h1>
      <p style={{ fontSize: 14, opacity: 0.8, marginBottom: 16, maxWidth: 360 }}>{message}</p>
      <button
        type="button"
        onClick={onRetry}
        style={{
          background: "#f97316",
          color: "#fff",
          border: 0,
          borderRadius: 10,
          padding: "10px 18px",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        רענון
      </button>
    </div>
  );
}

function Root() {
  const [showSplash, setShowSplash] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const dismissSplash = useCallback(() => setShowSplash(false), []);

  useEffect(() => {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  }, []);

  useEffect(() => {
    function onRejection(event: PromiseRejectionEvent) {
      if (isChunkLoadError(event.reason)) {
        event.preventDefault();
        setBootError("גרסה ישנה במטמון. לחץ רענון.");
      }
    }
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);

  if (bootError) {
    return (
      <BootError
        message={bootError}
        onRetry={() => {
          sessionStorage.removeItem(CHUNK_RELOAD_KEY);
          window.location.reload();
        }}
      />
    );
  }

  return (
    <>
      {showSplash ? <SplashScreen onDone={dismissSplash} /> : null}
      <ConvexAppProvider>
        <BoardItemViewProvider>
          <Suspense fallback={null}>
            <App />
          </Suspense>
        </BoardItemViewProvider>
      </ConvexAppProvider>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
