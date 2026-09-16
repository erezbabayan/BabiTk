import { FormEvent, useEffect, useState } from "react";

import {
  requestPhoneVerificationApi,
  verifyPhoneCodeApi,
} from "../lib/api";
import { ChannelInfoPanel } from "./ChannelInfoPanel";
import { GreenApiConnectSettings } from "./GreenApiConnectSettings";
import type { UsageSummary } from "../lib/api";
import { normalizePhone, personalCaptureChatId } from "../lib/phone";
import {
  getCloudUserProfile,
  updateCloudUserProfile,
  type CloudUserProfile,
  type DigestDays,
} from "../lib/user-profile";

const DIGEST_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MAX_DIGEST_HOURS = 3;

function formatDigestHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatDigestHoursList(hours: number[]): string {
  return hours.map(formatDigestHour).join(", ");
}

interface SupabasePhoneLinkSettingsProps {
  summary: UsageSummary | null;
}

export function SupabasePhoneLinkSettings({ summary }: SupabasePhoneLinkSettingsProps) {
  const [profile, setProfile] = useState<CloudUserProfile | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [verifyStep, setVerifyStep] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingPhone, setSavingPhone] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [savingDigestHours, setSavingDigestHours] = useState(false);
  const [savingDigestDays, setSavingDigestDays] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const next = await getCloudUserProfile();
    setProfile(next);
    setGroupName(next.whatsapp_capture_group_name?.trim() ?? "");
    return next;
  }

  useEffect(() => {
    let cancelled = false;
    void refresh()
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "טעינת הפרופיל נכשלה");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const linkedPhone = profile?.phone_verified ? profile.phone : null;
  const groupConnected = Boolean(profile?.whatsapp_capture_group_name?.trim());
  const digestHours = profile?.whatsapp_digest_hours ?? [9];
  const digestDays: DigestDays = profile?.whatsapp_digest_days ?? "everyday";
  const captureIsPersonal = Boolean(
    profile?.whatsapp_capture_group_chat_id?.trim().toLowerCase().endsWith("@c.us"),
  );

  async function handleLinkPhone(event: FormEvent) {
    event.preventDefault();
    setSavingPhone(true);
    setError(null);
    setMessage(null);
    try {
      const normalized = normalizePhone(phone);
      try {
        const result = await requestPhoneVerificationApi(normalized);
        setVerifyStep(true);
        setMessage(
          result.devCode
            ? `${result.message}: ${result.devCode}`
            : result.message,
        );
        return;
      } catch {
        const personalChat = personalCaptureChatId(normalized);
        const next = await updateCloudUserProfile({
          phone: normalized,
          whatsapp_capture_group_chat_id:
            profile?.whatsapp_capture_group_chat_id ?? personalChat,
          whatsapp_capture_group_name:
            profile?.whatsapp_capture_group_name ??
            (personalChat ? "הודעה לעצמי (BabiTk)" : null),
        });
        setProfile(next);
        setPhone("");
        setGroupName(next.whatsapp_capture_group_name?.trim() ?? "");
        setMessage(
          `המספר נשמר: ${normalized}. הוא יאומת כשתשלחו הודעה מהוואטסאפ המחובר.`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בחיבור המספר");
    } finally {
      setSavingPhone(false);
    }
  }

  async function handleVerifyCode(event: FormEvent) {
    event.preventDefault();
    setSavingPhone(true);
    setError(null);
    setMessage(null);
    try {
      const result = await verifyPhoneCodeApi(code.trim());
      const next = await refresh();
      setVerifyStep(false);
      setCode("");
      setPhone("");
      setGroupName(next.whatsapp_capture_group_name?.trim() ?? "");
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "קוד האימות שגוי");
    } finally {
      setSavingPhone(false);
    }
  }

  async function handleSaveGroup(event: FormEvent) {
    event.preventDefault();
    const name = groupName.trim();
    if (!name) {
      setError("הזינו שם קבוצה קיימת לחיבור");
      return;
    }
    setSavingGroup(true);
    setError(null);
    setMessage(null);
    try {
      const next = await updateCloudUserProfile({
        whatsapp_capture_group_name: name,
        whatsapp_capture_group_chat_id: profile?.whatsapp_capture_group_chat_id ?? null,
      });
      setProfile(next);
      setMessage(`הקבוצה «${name}» נשמרה בחשבון.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירת הקבוצה");
    } finally {
      setSavingGroup(false);
    }
  }

  async function handleDisconnectGroup() {
    setError(null);
    setMessage(null);
    try {
      const next = await updateCloudUserProfile({
        whatsapp_capture_group_chat_id: null,
        whatsapp_capture_group_name: null,
      });
      setProfile(next);
      setGroupName("");
      setMessage("נותקת מהקבוצה. אפשר לחבר שוב למטה.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בניתוק");
    }
  }

  async function handleDigestDaysChange(nextDays: DigestDays) {
    if (nextDays === digestDays) return;
    setSavingDigestDays(true);
    setError(null);
    try {
      const next = await updateCloudUserProfile({ whatsapp_digest_days: nextDays });
      setProfile(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירת ימי השליחה");
    } finally {
      setSavingDigestDays(false);
    }
  }

  async function handleDigestHourToggle(hour: number) {
    const selected = digestHours.includes(hour);
    let nextHours: number[];
    if (selected) {
      if (digestHours.length <= 1) {
        setError("יש לבחור לפחות מועד אחד");
        return;
      }
      nextHours = digestHours.filter((value) => value !== hour);
    } else {
      if (digestHours.length >= MAX_DIGEST_HOURS) {
        setError(`ניתן לבחור עד ${MAX_DIGEST_HOURS} מועדים`);
        return;
      }
      nextHours = [...digestHours, hour].sort((a, b) => a - b);
    }

    setSavingDigestHours(true);
    setError(null);
    try {
      const next = await updateCloudUserProfile({ whatsapp_digest_hours: nextHours });
      setProfile(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירת שעות התזכורת");
    } finally {
      setSavingDigestHours(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">טוען...</p>;
  }

  const digestBlock = (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm" dir="rtl">
      <p className="font-medium text-slate-900">תזכורת יומית</p>
      <p className="mt-1 text-xs text-slate-600">
        סיכום התזכורות של אותו יום — עד {MAX_DIGEST_HOURS} מועדים. נשמר בחשבון.
      </p>
      <p className="mt-3 text-xs font-medium text-slate-700">ימי שליחה</p>
      <div className="mt-2 flex flex-wrap justify-end gap-1.5">
        {(
          [
            { id: "weekdays" as const, label: "ימי חול (א׳–ה׳)" },
            { id: "everyday" as const, label: "כל השבוע" },
          ] as const
        ).map((option) => {
          const selected = digestDays === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={!profile || savingDigestDays || savingDigestHours}
              onClick={() => void handleDigestDaysChange(option.id)}
              className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                selected
                  ? "border-blue-500 bg-blue-50 font-semibold text-blue-800"
                  : "border-slate-300 bg-white text-slate-700"
              } disabled:opacity-50`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs font-medium text-slate-700">
        מועדי שליחה
        {digestHours.length > 0 ? ` · ${formatDigestHoursList(digestHours)}` : ""}
      </p>
      <div className="mt-2 flex flex-wrap justify-end gap-1.5">
        {DIGEST_HOURS.map((hour) => {
          const selected = digestHours.includes(hour);
          const atLimit = !selected && digestHours.length >= MAX_DIGEST_HOURS;
          return (
            <button
              key={hour}
              type="button"
              disabled={!profile || savingDigestHours || atLimit}
              onClick={() => void handleDigestHourToggle(hour)}
              className={`rounded-lg border px-2 py-1 text-xs ${
                selected
                  ? "border-blue-500 bg-blue-50 font-semibold text-blue-800"
                  : "border-slate-300 bg-white text-slate-700"
              } disabled:opacity-40`}
            >
              {formatDigestHour(hour)}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {digestDays === "weekdays" ? "ימי חול בלבד · " : "כל השבוע · "}
        עד {MAX_DIGEST_HOURS} שעות ביום
        {savingDigestHours || savingDigestDays ? " · שומר…" : ""}
      </p>
    </div>
  );

  const groupBlock = linkedPhone ? (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm" dir="rtl">
      <p className="font-medium text-sky-950">קבוצת קליטה</p>
      <p className="mt-1 text-xs text-sky-800">
        שמרו את שם הקבוצה הקיימת (למשל «משימות ארז»). אחרי חיבור GREEN-API, הודעות מהקבוצה נכנסות ללוח.
      </p>

      {groupConnected ? (
        <div className="mt-3 rounded-lg border border-emerald-300 bg-white px-3 py-2">
          <p className="text-emerald-900">
            {captureIsPersonal ? "יעד קליטה: " : "מחובר לקבוצה: "}
            <strong>
              {profile?.whatsapp_capture_group_name?.trim() ||
                (captureIsPersonal ? "הודעה לעצמי" : "קבוצה")}
            </strong>
          </p>
          <button
            type="button"
            className="mt-2 text-xs font-medium text-sky-800 underline"
            onClick={() => void handleDisconnectGroup()}
          >
            {captureIsPersonal ? "נתק יעד קליטה" : "נתק מהקבוצה"}
          </button>
        </div>
      ) : (
        <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">
          עדיין לא מחובר לקבוצה — הזינו שם ושמרו.
        </p>
      )}

      <form onSubmit={(event) => void handleSaveGroup(event)} className="mt-4 space-y-3">
        <label className="block text-xs font-medium text-sky-900">שם קבוצה קיימת</label>
        <input
          type="text"
          placeholder="למשל משימות ארז"
          value={groupName}
          onChange={(event) => setGroupName(event.target.value)}
          className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-slate-900"
        />
        <button
          type="submit"
          disabled={savingGroup || !groupName.trim()}
          className="w-full rounded-lg bg-sky-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {savingGroup ? "שומר…" : "שמור קבוצת קליטה"}
        </button>
      </form>
    </div>
  ) : null;

  if (linkedPhone) {
    return (
      <ChannelInfoPanel channelId="whatsapp" summary={summary} compact>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm" dir="rtl">
          <p className="font-medium text-emerald-900">מחובר</p>
          <p className="mt-1 text-emerald-800" dir="ltr">
            {linkedPhone}
          </p>
          <p className="mt-2 text-xs text-emerald-700">
            המספר והקבוצה שמורים בחשבון. חברו GREEN-API למטה כדי לקלוט הודעות חיות.
          </p>
        </div>
        {groupBlock}
        <GreenApiConnectSettings />
        {digestBlock}
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </ChannelInfoPanel>
    );
  }

  return (
    <ChannelInfoPanel channelId="whatsapp" summary={summary} compact>
      <p className="text-sm text-slate-600" dir="rtl">
        חברו מספר וואטסאפ — ואז שמרו קבוצה קיימת וחברו GREEN-API לקליטה חיה.
      </p>
      <GreenApiConnectSettings />
      {digestBlock}
      {verifyStep ? (
        <form onSubmit={(event) => void handleVerifyCode(event)} className="space-y-3">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="קוד אימות"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            dir="ltr"
            required
          />
          <button
            type="submit"
            disabled={savingPhone || code.trim().length < 4}
            className="w-full rounded-lg bg-blue-600 px-3 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {savingPhone ? "מאמת..." : "אמת קוד"}
          </button>
        </form>
      ) : (
        <form onSubmit={(event) => void handleLinkPhone(event)} className="space-y-3">
          <input
            type="tel"
            placeholder="+972501234567"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            dir="ltr"
            required
          />
          <button
            type="submit"
            disabled={savingPhone}
            className="w-full rounded-lg bg-blue-600 px-3 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {savingPhone ? "שומר..." : "חבר מספר"}
          </button>
        </form>
      )}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </ChannelInfoPanel>
  );
}
