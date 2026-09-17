import { FormEvent, useEffect, useState } from "react";

import {
  clearWhatsAppGateway,
  invokeGreenConnect,
  loadWhatsAppGateway,
  saveWhatsAppGateway,
  type GreenConnectAction,
  type GreenConnectStatus,
  type WhatsAppGatewayRow,
} from "../lib/whatsapp-gateway";
import {
  formatPairingCode,
  preferPhonePairingOnThisDevice,
  WHATSAPP_PAIRING_HINT,
  WHATSAPP_SCAN_HINT,
} from "../lib/whatsapp-pairing";

const GREEN_CONSOLE = "https://console.green-api.com/";

type ConnectMethod = "qr" | "phone";

interface GreenApiConnectSettingsProps {
  onLinked?: () => void;
}

export function GreenApiConnectSettings({ onLinked }: GreenApiConnectSettingsProps) {
  const [gateway, setGateway] = useState<WhatsAppGatewayRow | null>(null);
  const [status, setStatus] = useState<GreenConnectStatus | null>(null);
  const [instanceId, setInstanceId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [showKeys, setShowKeys] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [method, setMethod] = useState<ConnectMethod>(() =>
    preferPhonePairingOnThisDevice() ? "phone" : "qr",
  );
  const [phone, setPhone] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  async function refreshStatus(
    action: GreenConnectAction = "status",
    extra?: { phone?: string },
  ): Promise<GreenConnectStatus | null> {
    const next = await invokeGreenConnect(action, extra);
    setStatus(next);
    if (next.instanceId) setInstanceId(next.instanceId);
    if (next.configured) setShowKeys(false);
    if (next.pairingCode) setPairingCode(next.pairingCode);
    if (next.authorized) {
      setPairingCode(null);
      onLinked?.();
    }
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
        let next = await refreshStatus(row ? "configureWebhook" : "status");
        if (cancelled) return;
        if (!row && next?.canAutoProvision && !next.configured) {
          next = await refreshStatus("ensureInstance");
          if (cancelled) return;
        }
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

  async function handleSaveKeys(event: FormEvent) {
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
          : method === "phone"
            ? "הזינו מספר וואטסאפ לקבלת קוד חיבור."
            : WHATSAPP_SCAN_HINT,
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

  async function handlePairing(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const next = await refreshStatus("pairingCode", { phone });
      if (next?.pairingCode) {
        setPairingCode(next.pairingCode);
        setMessage("הזינו את הקוד בוואטסאפ. אחרי החיבור תתקבל הודעת אישור.");
      } else if (next?.authorized) {
        setMessage("הוואטסאפ כבר מחובר.");
      } else {
        setError(next?.hint || "לא הצלחנו להפיק קוד. נסו סריקת QR במחשב.");
        if (!next?.configured) setShowKeys(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "בקשת קוד החיבור נכשלה");
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
      setPairingCode(null);
      setShowKeys(true);
      setMessage("חיבור הוואטסאפ נותק.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ניתוק נכשל");
    } finally {
      setSaving(false);
    }
  }

  async function handleResendWelcome() {
    setSaving(true);
    setError(null);
    try {
      const next = await refreshStatus("sendWelcome");
      setMessage(next?.welcomeSent ? "נשלחה הודעת אישור לוואטסאפ." : next?.hint ?? "החיבור פעיל.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שליחת ההודעה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">טוען חיבור וואטסאפ...</p>;
  }

  const waiting = Boolean(status?.configured && !status.authorized);
  const connected = Boolean(status?.authorized);
  const needsKeys = !gateway && !status?.configured && !status?.canAutoProvision;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <p className="font-medium text-slate-900">חיבור וואטסאפ</p>
        <p className="mt-2 text-xs leading-5 text-slate-600">
          במחשב סורקים QR. בטלפון מזינים מספר ומקבלים קוד — בלי סריקה. אחרי החיבור תישלח הודעת אישור לוואטסאפ.
        </p>
      </div>

      {connected ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          <p className="font-medium">הוואטסאפ מחובר</p>
          <p className="mt-1 text-xs">{status?.hint}</p>
          {status?.linkedPhone ? (
            <p className="mt-1 text-xs" dir="ltr">
              {status.linkedPhone}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              className="text-xs font-medium underline"
              onClick={() => void handleResendWelcome()}
              disabled={saving}
            >
              שלח שוב הודעת אישור
            </button>
            <button
              type="button"
              className="text-xs font-medium underline"
              onClick={() => void handleDisconnect()}
              disabled={saving}
            >
              נתק
            </button>
          </div>
        </div>
      ) : null}

      {waiting || !connected ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="flex gap-2">
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                method === "qr" ? "bg-amber-900 text-white" : "bg-white text-amber-900"
              }`}
              onClick={() => setMethod("qr")}
            >
              סריקת QR
            </button>
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                method === "phone" ? "bg-amber-900 text-white" : "bg-white text-amber-900"
              }`}
              onClick={() => setMethod("phone")}
            >
              בלי סריקה — קוד בטלפון
            </button>
          </div>

          {method === "qr" ? (
            <div className="mt-3">
              <p className="font-medium">סרקו עם הוואטסאפ בטלפון</p>
              <p className="mt-1 text-xs">{WHATSAPP_SCAN_HINT}</p>
              {status?.qrBase64 ? (
                <img
                  alt="QR לחיבור וואטסאפ"
                  className="mx-auto mt-3 h-52 w-52 rounded-lg bg-white p-2"
                  src={`data:image/png;base64,${status.qrBase64}`}
                />
              ) : status?.configured ? (
                <p className="mt-3 text-xs">טוען QR...</p>
              ) : (
                <p className="mt-3 text-xs">
                  אם ה-QR לא מופיע, השלימו קודם את ההגדרה החד-פעמית למטה — ואז הסריקה תופיע כאן.
                </p>
              )}
              {status?.qrPageUrl ? (
                <a
                  className="mt-2 inline-block text-xs underline"
                  href={status.qrPageUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  אם ה-QR לא מופיע — פתחו בדף נפרד
                </a>
              ) : null}
            </div>
          ) : (
            <div className="mt-3">
              <p className="font-medium">חברו עם מספר טלפון</p>
              <p className="mt-1 text-xs">{WHATSAPP_PAIRING_HINT}</p>
              <form onSubmit={(event) => void handlePairing(event)} className="mt-3 space-y-3">
                <label className="block text-xs font-medium">
                  מספר הוואטסאפ
                  <input
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="0501234567"
                    className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900"
                    dir="ltr"
                    required
                  />
                </label>
                <button
                  type="submit"
                  disabled={saving || !phone.trim()}
                  className="w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? "מכין קוד…" : pairingCode ? "חדש קוד" : "שלח קוד חיבור"}
                </button>
              </form>
              {pairingCode ? (
                <div className="mt-4 rounded-xl border border-emerald-300 bg-white p-4 text-center">
                  <p className="text-xs text-slate-600">הקוד להזנה בוואטסאפ</p>
                  <p className="mt-2 font-mono text-3xl font-bold tracking-widest text-emerald-800" dir="ltr">
                    {formatPairingCode(pairingCode)}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    וואטסאפ → הגדרות → מכשירים מקושרים → קישור מכשיר → קישור עם מספר טלפון
                  </p>
                </div>
              ) : null}
            </div>
          )}

          {status?.configured ? (
            <button
              type="button"
              className="mt-3 text-xs font-medium underline"
              onClick={() => void handleDisconnect()}
              disabled={saving}
            >
              נתק
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      {needsKeys || showKeys ? (
        <form onSubmit={(event) => void handleSaveKeys(event)} className="space-y-3 rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-medium text-slate-900">הגדרה חד-פעמית</p>
          <p className="text-xs leading-5 text-slate-600">
            פעם אחת: צרו instance חינמי ב-
            <a className="underline" href={GREEN_CONSOLE} target="_blank" rel="noreferrer">
              GREEN-API
            </a>
            , הדביקו את המפתחות, ואז סרקו או הזינו מספר.
          </p>
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
            {saving ? "שומר…" : "שמור והמשך לחיבור"}
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="text-xs text-slate-500 underline"
          onClick={() => setShowKeys((open) => !open)}
        >
          הגדרה מתקדמת (מפתחות GREEN-API)
        </button>
      )}
    </div>
  );
}
