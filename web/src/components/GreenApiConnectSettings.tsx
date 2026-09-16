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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refreshStatus(): Promise<GreenConnectStatus | null> {
    const next = await invokeGreenConnect("status");
    setStatus(next);
    return next;
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const row = await loadWhatsAppGateway();
        if (cancelled) return;
        setGateway(row);
        if (row) {
          setInstanceId(row.instance_id);
          await refreshStatus();
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "טעינת חיבור הוואטסאפ נכשלה");
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
    if (!gateway || status?.authorized) return;
    const timer = window.setInterval(() => {
      void refreshStatus().catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [gateway, status?.authorized]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const row = await saveWhatsAppGateway({ instanceId, apiToken });
      setGateway(row);
      setApiToken("");
      await invokeGreenConnect("configureWebhook");
      const next = await refreshStatus();
      setMessage(
        next?.authorized
          ? "הוואטסאפ מחובר וה-webhook הוגדר."
          : "המפתחות נשמרו. סרקו את ה-QR כדי לאשר את המכשיר.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירת החיבור נכשלה");
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

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <p className="font-medium text-slate-900">חיבור וואטסאפ — חינם</p>
        <p className="mt-2 text-xs leading-5 text-slate-600">
          BabiTk קולט הודעות מקבוצה או מ«הודעה לעצמי», כמו פעם. מומלץ{" "}
          <strong>GREEN-API Developer</strong> — חינם, QR, קבוצות, עד 3 צ׳אטים בחודש
          (מספיק לקבוצת משימות + הודעה לעצמי).
        </p>
        <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
          <li>
            <strong>GREEN-API</strong> — מומלץ.{" "}
            <a className="text-sky-700 underline" href={GREEN_CONSOLE} target="_blank" rel="noreferrer">
              console.green-api.com
            </a>
          </li>
          <li>
            <strong>WhatsApp Cloud API (Meta)</strong> — רשמי ויציב, אבל דורש חשבון עסקי
            ומספר ייעודי. לא מתאים לקבוצת וואטסאפ רגילה.
          </li>
          <li>
            <strong>Whapi.Cloud</strong> — Sandbox חינם (5 צ׳אטים). בתשלום כ־35$ לחודש.
          </li>
          <li>
            <strong>Evolution API</strong> — קוד פתוח חינם, אבל צריך שרת משלכם (לא חינם).
          </li>
        </ul>
      </div>

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
            placeholder={gateway ? "השאירו ריק רק אם כבר שמור — חובה בעת שמירה מחדש" : ""}
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

      {status?.configured ? (
        <div
          className={`rounded-xl border p-4 text-sm ${
            status.authorized
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
        >
          <p className="font-medium">
            {status.authorized ? "מכשיר מחובר" : "ממתין לסריקת QR"}
          </p>
          <p className="mt-1 text-xs">{status.hint}</p>
          {status.stateInstance ? (
            <p className="mt-1 text-xs" dir="ltr">
              state: {status.stateInstance}
            </p>
          ) : null}
          {!status.authorized && status.qrBase64 ? (
            <img
              alt="QR לחיבור וואטסאפ"
              className="mx-auto mt-3 h-48 w-48 rounded-lg bg-white p-2"
              src={`data:image/png;base64,${status.qrBase64}`}
            />
          ) : null}
          {!status.authorized && status.qrPageUrl ? (
            <a
              className="mt-2 inline-block text-xs underline"
              href={status.qrPageUrl}
              target="_blank"
              rel="noreferrer"
            >
              פתיחת דף QR של GREEN-API
            </a>
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

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
