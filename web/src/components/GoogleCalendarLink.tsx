import { useEffect, useState } from "react";
import { getGoogleCalendarConnectUrl, getGoogleCalendarStatus } from "../lib/api";

export function GoogleCalendarLink() {
  const [linked, setLinked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getGoogleCalendarStatus()
      .then(setLinked)
      .catch(() => setLinked(false))
      .finally(() => setLoading(false));
  }, []);

  async function handleConnect() {
    const url = await getGoogleCalendarConnectUrl();
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (loading) return null;

  return (
    <button
      type="button"
      onClick={() => void handleConnect()}
      disabled={linked}
      className="border border-slate-300 hover:bg-slate-50 disabled:opacity-60"
    >
      {linked ? "📅 יומן מחובר" : "📅 חבר Google Calendar"}
    </button>
  );
}
