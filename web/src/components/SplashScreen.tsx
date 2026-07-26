import { useEffect, useRef, useState } from "react";

import { MindTaskerLogo } from "./MindTaskerLogo";

const SPLASH_MS = 1200;

/**
 * Startup splash — full logo with animated brush bars (thinking illustration).
 */
export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [exiting, setExiting] = useState(false);
  const finished = useRef(false);

  useEffect(() => {
    const fadeAt = window.setTimeout(() => setExiting(true), SPLASH_MS - 400);
    const doneAt = window.setTimeout(() => {
      if (finished.current) return;
      finished.current = true;
      onDone();
    }, SPLASH_MS);
    return () => {
      window.clearTimeout(fadeAt);
      window.clearTimeout(doneAt);
    };
  }, [onDone]);

  return (
    <div
      className={`splash-screen ${exiting ? "splash-screen--exit" : ""}`}
      role="status"
      aria-live="polite"
      aria-label="טוען את BabiTk"
    >
      <div className="splash-screen-inner">
        <MindTaskerLogo size="large" thinking className="splash-logo" />
        <p className="splash-caption">מסדר את המחשבות…</p>
      </div>
    </div>
  );
}
