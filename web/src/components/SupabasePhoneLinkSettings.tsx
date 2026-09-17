import { FormEvent, useEffect, useState } from "react";

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
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingPhone, setSavingPhone] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [savingNotifyGroup, setSavingNotifyGroup] = useState(false);
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
  const captureChatId = profile?.whatsapp_capture_group_chat_id?.trim() ?? "";
  const notifyWhatsAppGroup = profile?.notify_whatsapp_group === true;
  const captureIsPersonal = Boolean(captureChatId.toLowerCase().endsWith("@c.us"));
  const captureIsGroup = captureChatId.toLowerCase().endsWith("@g.us");

  async function handleLinkPhone(event: FormEvent) {
    event.preventDefault();
    setSavingPhone(true);
    setError(null);
    setMessage(null);
    try {
      const normalized = normalizePhone(phone);
      const personalChat = personalCaptureChatId(normalized);
      const next = await updateCloudUserProfile({
        phone: normalized,
        phone_verified: true,
        whatsapp_capture_group_chat_id:
          profile?.whatsapp_capture_group_chat_id ?? personalChat,
        whatsapp_capture_group_name:
          profile?.whatsapp_capture_group_name ??
          (personalChat ? "הודעה לעצמי (BabiTk)" : null),
      });
      setProfile(next);
      setPhone("");
      setGroupName(next.whatsapp_capture_group_name?.trim() ?? "");
      setMessage(`מספר מחובר: ${normalized}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בחיבור המספר");
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
        notify_whatsapp_group: false,
      });
      setProfile(next);
      setGroupName("");
      setMessage("נותקת מהקבוצה. אפשר לחבר שוב למטה.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בניתוק");
    }
  }

  async function handleNotifyGroupToggle(enabled: boolean) {
    if (!captureIsGroup) {
      setError("קודם חברו קבוצת קליטה, ואז אפשר לקבל אליה תזכורות.");
      return;
    }
    setSavingNotifyGroup(true);
    setError(null);
    try {
      const next = await updateCloudUserProfile({ notify_whatsapp_group: enabled });
      setProfile(next);
      setMessage(
        enabled
          ? "תזכורות פעילות יישלחו כהודעה לקבוצת הוואטסאפ שהוגדרה."
          : "תזכורות לקבוצה כובו.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירת הגדרת התזכורות");
    } finally {
      setSavingNotifyGroup(false);
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
      <p className="font-medium text-slate-900">ריכוז תזכורות</p>
      <p className="mt-1 text-xs text-slate-600">
        בשעות האלה נשלחת לוואטסאפ רשימת התזכורות של היום. בנוסף, כל תזכורת נשלחת גם בזמן שמוגדר לה.
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
        עד {MAX_DIGEST_HOURS} שעות ביום · כל תזכורת נשלחת גם בזמן שלה
        {savingDigestHours || savingDigestDays ? " · שומר…" : ""}
      </p>
    </div>
  );

  const groupBlock = (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm" dir="rtl">
      <p className="font-medium text-sky-950">קבוצת קליטה</p>
      <p className="mt-1 text-xs text-sky-800">
        שמרו את שם הקבוצה הקיימת (למשל «משימות ארז»). אחרי חיבור הוואטסאפ, הודעות מהקבוצה נכנסות ללוח.
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

      <label className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-sky-200 bg-white px-3 py-3">
        <span className="text-right">
          <span className="block text-sm font-medium text-sky-950">
            תזכורות פעילות לקבוצה
          </span>
          <span className="mt-0.5 block text-xs text-sky-800">
            {captureIsGroup
              ? `כשמגיע מועד תזכורת — הודעה לקבוצה «${profile?.whatsapp_capture_group_name?.trim() || "קבוצת הקליטה"}»`
              : "דורש קבוצת וואטסאפ שהוגדרה למעלה (לא הודעה אישית)"}
          </span>
        </span>
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={notifyWhatsAppGroup}
          disabled={!captureIsGroup || savingNotifyGroup}
          onChange={(event) => void handleNotifyGroupToggle(event.target.checked)}
        />
      </label>

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
  );

  return (
    <ChannelInfoPanel channelId="whatsapp" summary={summary} compact>
      <GreenApiConnectSettings onLinked={() => void refresh().catch(() => undefined)} />

      {linkedPhone ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm" dir="rtl">
          <p className="font-medium text-emerald-900">מספר שמור בחשבון</p>
          <p className="mt-1 text-emerald-800" dir="ltr">
            {linkedPhone}
          </p>
        </div>
      ) : (
        <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm" dir="rtl">
          <summary className="cursor-pointer text-xs text-slate-500">שמירת מספר בלי חיבור וואטסאפ</summary>
          <form onSubmit={(event) => void handleLinkPhone(event)} className="mt-3 space-y-3">
            <input
              type="tel"
              placeholder="0501234567"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              dir="ltr"
              required
            />
            <button
              type="submit"
              disabled={savingPhone}
              className="w-full rounded-lg bg-slate-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {savingPhone ? "שומר..." : "שמור מספר"}
            </button>
          </form>
        </details>
      )}

      {groupBlock}
      {digestBlock}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </ChannelInfoPanel>
  );
}
