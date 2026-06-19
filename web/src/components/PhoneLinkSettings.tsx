import { FormEvent, useEffect, useState } from "react";
import {
  getProfileApi,
  getWhatsAppStatusApi,
  requestPhoneVerificationApi,
  verifyPhoneCodeApi,
  type UsageSummary,
  type UserProfile,
  type WhatsAppProviderStatus,
} from "../lib/api";
import { useConvexPhoneLink } from "../hooks/useConvexPhoneLink";
import { useConvexBackend } from "../lib/data-backend";
import { isDemoMode } from "../lib/supabase";
import { ChannelInfoPanel } from "./ChannelInfoPanel";
import { WhatsAppProviderInfo } from "./WhatsAppProviderInfo";

interface PhoneLinkSettingsProps {
  userId: string;
  summary: UsageSummary | null;
}

export function PhoneLinkSettings({ userId, summary }: PhoneLinkSettingsProps) {
  const demoConvexLink = isDemoMode && useConvexBackend();
  const convexPhone = useConvexPhoneLink(demoConvexLink ? userId : undefined);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"idle" | "verify">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [waStatus, setWaStatus] = useState<WhatsAppProviderStatus | null>(null);

  useEffect(() => {
    if (demoConvexLink) return;
    void getProfileApi()
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [demoConvexLink, userId]);

  useEffect(() => {
    void getWhatsAppStatusApi()
      .then(setWaStatus)
      .catch(() => setWaStatus(null));
  }, [userId]);

  async function handleDemoLink(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const linked = await convexPhone.linkPhone(phone);
      setPhone("");
      setMessage(`וואטסאפ מחובר: ${linked}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  async function handleRequest(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await requestPhoneVerificationApi(phone);
      setStep("verify");
      setMessage(
        result.devCode
          ? `${result.message}: ${result.devCode}`
          : result.message,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await verifyPhoneCodeApi(code);
      setProfile(result.profile);
      setStep("idle");
      setCode("");
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  const linkedPhone = demoConvexLink ? convexPhone.linkedPhone : profile?.phone_verified ? profile.phone : null;

  if (linkedPhone) {
    return (
      <ChannelInfoPanel channelId="whatsapp" summary={summary}>
        <WhatsAppProviderInfo status={waStatus} />
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p className="font-medium text-emerald-900">וואטסאפ מחובר</p>
          <p className="mt-1 text-emerald-800" dir="ltr">
            {linkedPhone}
          </p>
          <p className="mt-2 text-emerald-700">
            שלח הודעות לבוט כדי לקלוט משימות והערות.
          </p>
        </div>
      </ChannelInfoPanel>
    );
  }

  return (
    <ChannelInfoPanel channelId="whatsapp" summary={summary}>
      <WhatsAppProviderInfo status={waStatus} />
      <p className="text-sm text-slate-600">
        קשר את מספר הוואטסאפ שלך כדי לקלוט משימות מהודעות, קול ותמונות.
      </p>

      {profile?.phone_pending ? (
        <p className="text-sm text-amber-700">
          ממתין לאימות: <span dir="ltr">{profile.phone_pending}</span>
        </p>
      ) : null}

      {demoConvexLink ? (
        <form onSubmit={handleDemoLink} className="space-y-3">
          <input
            type="tel"
            placeholder="+972501234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            dir="ltr"
            required
          />
          <button
            type="submit"
            disabled={loading || !convexPhone.ready}
            className="w-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {convexPhone.ready ? "קשר וואטסאפ" : "מכין חיבור..."}
          </button>
          <p className="text-xs text-slate-500">
            במצב Demo — הקישור נשמר ב-Convex לזיהוי הודעות נכנסות.
          </p>
        </form>
      ) : step === "idle" ? (
        <form onSubmit={handleRequest} className="space-y-3">
          <input
            type="tel"
            placeholder="+972501234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            dir="ltr"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            שלח קוד בוואטסאפ
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="space-y-3">
          <input
            type="text"
            inputMode="numeric"
            placeholder="קוד אימות"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-center tracking-widest"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            אמת קוד
          </button>
          <button
            type="button"
            onClick={() => setStep("idle")}
            className="w-full text-slate-500"
          >
            חזור
          </button>
        </form>
      )}

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </ChannelInfoPanel>
  );
}
