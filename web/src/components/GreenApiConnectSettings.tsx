import { FormEvent, useEffect, useState } from "react";

import {
  clearWhatsAppGateway,
  invokeGreenConnect,
  loadWhatsAppGateway,
  saveWhatsAppGateway,
  type GreenConnectStatus,
  type WhatsAppGatewayRow,
} from "../lib/whatsapp-gateway";

const GREEN_CONSOLE = "https://console.green-api.com/";

export function GreenApiConnectSettings() {
  const [gateway, setGateway] = useState<WhatsAppGatewayRow | null>(null);
  const [status, setStatus] = useState<GreenConnectStatus | null>(null);
  const [instanceId, setInstanceId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [showKeys, setShowKeys] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refreshStatus(action: "status" | "configureWebhook" = "status"): Promise<GreenConnectStatus | null> {
    const next = await invokeGreenConnect(action);
    setStatus(next);
    if (next.instanceId) setInstanceId(next.instanceId);
    if (next.configured) setShowKeys(false);
    return next;
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const row = await loadWhatsAppGateway();
        if (cancelled) return;
        setGateway(row);
        if (row) setInstanceId(row.instance_id);
        const next = await refreshStatus(row ? "configureWebhook" : "status");
        if (cancelled) return;
        if (!row && !next?.configured) {
          setShowKeys(true);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "טעינת חיבור הוואטסאפ נכשלה");
          setShowKeys(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!status?.configured || status.authorized) return;
    const timer = window.setInterval(() => {
      void refreshStatus("status").catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [status?.configured, status?.authorized]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const row = await saveWhatsAppGateway({ instanceId, apiToken });
      setGateway(row);
      setApiToken("");
      const next = await refreshStatus("configureWebhook");
      setMessage(
        next?.authorized
          ? "הוואטסאפ מחובר וה-webhook הוגדר."
          : "סרקו את ה-QR למטה עם וואטסאפ → מכשירים מקושרים.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירת החיבור נכשלה");
      try {
        await refreshStatus("status");
      } catch {
        // keep save error
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await clearWhatsAppGateway();
      setGateway(null);
      setStatus(null);
      setInstanceId("");
      setApiToken("");
      setShowKeys(true);
      setMessage("חיבור GREEN-API נותק.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ניתוק נכשל");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">טוען חיבור וואטסאפ...</p>;
  }

  const waitingForQr = Boolean(status?.configured && !status.authorized);
  const connected = Boolean(status?.authorized);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <p className="font-medium text-slate-900">חיבור וואטסאפ — חינם</p>
        <p className="mt-2 text-xs leading-5 text-slate-600">
          BabiTk קולט הודעות מקבוצה או מ«הודעה לעצמי», כמו פעם. מומלץ{" "}
          <strong>GREEN-API Developer</strong> — חינם, QR, קבוצות, עד 3 צ׳אטים בחודש
          (מספיק לקבוצת משימות + הודעה לעצמי).
        </p>
      </div>

      {waitingForQr ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">סרקו כדי לחבר את הוואטסאפ</p>
          <p className="mt-1 text-xs">{status?.hint}</p>
          {status?.stateInstance ? (
            <p className="mt-1 text-xs" dir="ltr">
              state: {status.stateInstance}
            </p>
          ) : null}
          {status?.qrBase64 ? (
            <img
              alt="QR לחיבור וואטסאפ"
              className="mx-auto mt-3 h-52 w-52 rounded-lg bg-white p-2"
              src={`data:image/png;base64,${status.qrBase64}`}
            />
          ) : (
            <p className="mt-3 text-xs">טוען QR מ-GREEN-API...</p>
          )}
          {status?.qrPageUrl ? (
            <a
              className="mt-2 inline-block text-xs underline"
              href={status.qrPageUrl}
              target="_blank"
              rel="noreferrer"
            >
              אם ה-QR לא מופיע — פתחו את דף GREEN-API
            </a>
          ) : null}
          <p className="mt-3 text-xs">
            בוואטסאפ: הגדרות → מכשירים מקושרים → קישור מכשיר
          </p>
          <button
            type="button"
            className="mt-3 text-xs font-medium underline"
            onClick={() => void handleDisconnect()}
            disabled={saving}
          >
            נתק instance
          </button>
        </div>
      ) : null}

      {connected ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          <p className="font-medium">הוואטסאפ מחובר</p>
          <p className="mt-1 text-xs">{status?.hint}</p>
          {status?.instanceId ? (
            <p className="mt-1 text-xs" dir="ltr">
              instance: {status.instanceId}
            </p>
          ) : null}
          <button
            type="button"
            className="mt-3 text-xs font-medium underline"
            onClick={() => void handleDisconnect()}
            disabled={saving}
          >
            נתק instance
          </button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      <button
        type="button"
        className="text-xs text-slate-500 underline"
        onClick={() => setShowKeys((open) => !open)}
      >
        {showKeys ? "הסתר מפתחות GREEN-API" : gateway || status?.configured ? "מפתחות GREEN-API (רק אם צריך לעדכן)" : "הזנת מפתחות GREEN-API"}
      </button>

      {showKeys ? (
        <form onSubmit={(event) => void handleSave(event)} className="space-y-3 rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-medium text-slate-900">מפתחות GREEN-API</p>
          <ol className="list-decimal space-y-1 pr-4 text-xs text-slate-600">
            <li>צרו instance בתוכנית Developer (חינם)</li>
            <li>העתיקו Instance ID ו-API Token</li>
            <li>שמרו כאן וסרקו QR עם וואטסאפ → מכשירים מקושרים</li>
          </ol>
          <label className="block text-xs font-medium text-slate-600">
            Instance ID
            <input
              value={instanceId}
              onChange={(event) => setInstanceId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              dir="ltr"
              inputMode="numeric"
              required
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            API Token
            <input
              type="password"
              value={apiToken}
              onChange={(event) => setApiToken(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              dir="ltr"
              required
              autoComplete="off"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "שומר…" : gateway ? "עדכן וחבר webhook" : "שמור וחבר webhook"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
