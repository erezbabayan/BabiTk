import { useAction, useMutation, useQuery } from "convex/react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  getProfileApi,
  requestPhoneVerificationApi,
  verifyPhoneCodeApi,
  type UsageSummary,
  type UserProfile,
} from "../lib/api";
import { shouldUseConvexAuthLogin } from "../lib/auth-mode";
import { isConvexConfigured } from "../lib/convex";
import { isDemoMode, isSupabaseConfigured } from "../lib/supabase";
import { ChannelInfoPanel } from "./ChannelInfoPanel";

const DIGEST_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MAX_DIGEST_HOURS = 3;

type GreenLiveStatus = {
  configured: boolean;
  stateInstance: string | null;
  authorized: boolean;
  restricted: boolean;
  yellowCardUntil: string | null;
  hint: string;
};

type ConvexViewer = {
  userId: Id<"users">;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  phoneVerified: boolean;
  whatsappDigestHours?: number[];
  whatsappDigestDays?: "weekdays" | "everyday" | null;
  whatsappCaptureGroupChatId?: string | null;
  whatsappCaptureGroupName?: string | null;
};

function viewerDisplayName(viewer: {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
} | null | undefined): string {
  const full = viewer?.name?.trim();
  if (full) return full;
  return [viewer?.firstName, viewer?.lastName].filter(Boolean).join(" ").trim();
}

function formatDigestHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatDigestHoursList(hours: number[]): string {
  return hours.map(formatDigestHour).join(", ");
}

interface PhoneLinkSettingsProps {
  userId: string;
  summary: UsageSummary | null;
}

export function PhoneLinkSettings({ summary }: PhoneLinkSettingsProps) {
  const useConvexPhone =
    shouldUseConvexAuthLogin() || (isDemoMode && isConvexConfigured);
  const viewer = useQuery(
    api.users.viewer,
    useConvexPhone ? {} : "skip",
  ) as ConvexViewer | null | undefined;
  const linkVerifiedPhone = useMutation(api.users.linkVerifiedPhone);
  const updateNotificationPrefs = useMutation(api.users.updateNotificationPrefs);
  const bindExistingGroup = useAction(api.whatsappCaptureGroupActions.bindExistingCaptureGroup);
  const listCaptureGroups = useAction(api.whatsappCaptureGroupActions.listCaptureGroups);
  const clearWhatsAppCaptureGroup = useMutation(api.users.clearWhatsAppCaptureGroup);
  const saveWhatsAppCaptureGroup = useMutation(api.users.saveWhatsAppCaptureGroup);
  const getLiveConnectionStatus = useAction(api.whatsappOps.getLiveConnectionStatus);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"idle" | "verify">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingDigestHours, setSavingDigestHours] = useState(false);
  const [savingDigestDays, setSavingDigestDays] = useState(false);
  const [bindingGroup, setBindingGroup] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [selectingGroupId, setSelectingGroupId] = useState<string | null>(null);
  const [groupOptions, setGroupOptions] = useState<Array<{ chatId: string; name: string }>>(
    [],
  );
  const [groupSearch, setGroupSearch] = useState("");
  const [awaitingGroupMessage, setAwaitingGroupMessage] = useState(false);
  const [greenStatus, setGreenStatus] = useState<GreenLiveStatus | null>(null);

  useEffect(() => {
    if (!useConvexPhone || !viewer?.userId) return;
    let cancelled = false;
    void getLiveConnectionStatus({})
      .then((status) => {
        if (!cancelled) setGreenStatus(status);
      })
      .catch(() => {
        if (!cancelled) setGreenStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [useConvexPhone, viewer?.userId, getLiveConnectionStatus]);

  useEffect(() => {
    if (useConvexPhone || !isSupabaseConfigured) return;
    void getProfileApi()
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [useConvexPhone]);

  useEffect(() => {
    if (!useConvexPhone || !viewer) return;
    const defaultName = viewerDisplayName(viewer);
    if (defaultName) {
      setGroupSearch((prev) => (prev.trim() ? prev : defaultName));
    }
  }, [useConvexPhone, viewer?.userId, viewer?.name, viewer?.firstName, viewer?.lastName]);

  useEffect(() => {
    if (!useConvexPhone || !viewer?.phoneVerified) return;
    let cancelled = false;
    void (async () => {
      setLoadingGroups(true);
      try {
        const result = await listCaptureGroups({});
        if (cancelled) return;
        setGroupOptions(result.groups);
        if (!result.ok && result.reason) setError(result.reason);
      } catch {
        if (!cancelled) setGroupOptions([]);
      } finally {
        if (!cancelled) setLoadingGroups(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useConvexPhone, viewer?.phoneVerified, listCaptureGroups]);

  useEffect(() => {
    if (viewer?.whatsappCaptureGroupChatId && awaitingGroupMessage) {
      setAwaitingGroupMessage(false);
      setMessage(
        `הקבוצה חוברה: ${viewer.whatsappCaptureGroupName?.trim() || "יעד קליטה"}`,
      );
    }
  }, [
    viewer?.whatsappCaptureGroupChatId,
    viewer?.whatsappCaptureGroupName,
    awaitingGroupMessage,
  ]);

  const digestHours: number[] = viewer?.whatsappDigestHours ?? [9];
  const digestDays = viewer?.whatsappDigestDays ?? "everyday";
  const convexReady = Boolean(viewer?.userId);

  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    if (!q) return [];
    return groupOptions.filter((g) => g.name.toLowerCase().includes(q));
  }, [groupOptions, groupSearch]);
  const hasGroupSearch = groupSearch.trim().length > 0;

  const linkedPhone = useConvexPhone
    ? viewer?.phoneVerified && viewer.phone
      ? viewer.phone
      : null
    : profile?.phone_verified
      ? profile.phone
      : null;

  const groupConnected = Boolean(viewer?.whatsappCaptureGroupChatId);
  const captureIsPersonal = Boolean(
    viewer?.whatsappCaptureGroupChatId?.trim().toLowerCase().endsWith("@c.us"),
  );

  async function handleDigestDaysChange(next: "weekdays" | "everyday") {
    if (next === digestDays) return;
    setSavingDigestDays(true);
    setError(null);
    try {
      await updateNotificationPrefs({ whatsappDigestDays: next });
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירת ימי השליחה");
    } finally {
      setSavingDigestDays(false);
    }
  }

  async function handleDigestHourToggle(hour: number) {
    const selected = digestHours.includes(hour);
    let next: number[];
    if (selected) {
      if (digestHours.length <= 1) {
        setError("יש לבחור לפחות מועד אחד");
        return;
      }
      next = digestHours.filter((value) => value !== hour);
    } else {
      if (digestHours.length >= MAX_DIGEST_HOURS) {
        setError(`ניתן לבחור עד ${MAX_DIGEST_HOURS} מועדים`);
        return;
      }
      next = [...digestHours, hour].sort((a, b) => a - b);
    }

    setSavingDigestHours(true);
    setError(null);
    try {
      await updateNotificationPrefs({ whatsappDigestHours: next });
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירת שעות התזכורת");
    } finally {
      setSavingDigestHours(false);
    }
  }

  async function handleConvexLink(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      if (!viewer?.userId) {
        throw new Error("המשתמש עדיין נטען. נסה שוב בעוד רגע.");
      }
      const linked = await linkVerifiedPhone({
        userId: viewer.userId as Id<"users">,
        phone,
      });
      setPhone("");
      setMessage(`מספר מחובר: ${linked}. עכשיו בחרו קבוצת קליטה.`);
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
      setMessage(result.devCode ? `${result.message}: ${result.devCode}` : result.message);
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
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  async function handleBindExistingGroup() {
    const name = groupSearch.trim() || viewerDisplayName(viewer);
    if (!name) {
      setError("הזינו שם קבוצה קיימת לחיבור");
      return;
    }
    setBindingGroup(true);
    setError(null);
    setMessage(null);
    try {
      const result = await bindExistingGroup({
        groupName: name,
        replaceExisting: true,
      });
      if (result.ok) {
        setMessage(`חוברה הקבוצה «${result.name?.trim() || name}».`);
        const refresh = await listCaptureGroups({}).catch(() => null);
        if (refresh?.groups) setGroupOptions(refresh.groups);
      } else {
        setError(result.reason ?? "חיבור הקבוצה נכשל");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בחיבור קבוצה");
    } finally {
      setBindingGroup(false);
    }
  }

  async function handleSelectGroup(chatId: string, name: string) {
    setSelectingGroupId(chatId);
    setError(null);
    setMessage(null);
    try {
      await saveWhatsAppCaptureGroup({ chatId, name });
      setGroupSearch(name);
      setMessage(`הקבוצה «${name}» חוברה.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בבחירת קבוצה");
    } finally {
      setSelectingGroupId(null);
    }
  }

  async function handleDisconnectGroup() {
    setError(null);
    setMessage(null);
    try {
      await clearWhatsAppCaptureGroup({});
      setAwaitingGroupMessage(false);
      setMessage("נותקת מהקבוצה. אפשר לחבר שוב למטה.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בניתוק");
    }
  }

  async function handleBindByGroupMessage() {
    setError(null);
    setMessage(null);
    try {
      await clearWhatsAppCaptureGroup({});
      setAwaitingGroupMessage(true);
      setMessage(
        "פתחו בוואטסאפ את הקבוצה הקיימת ושלחו שם הודעה — היא תתחבר אוטומטית.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    }
  }

  const digestBlock = useConvexPhone ? (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm" dir="rtl">
      <p className="font-medium text-slate-900">תזכורת יומית</p>
      <p className="mt-1 text-xs text-slate-600">
        סיכום התזכורות של אותו יום — עד {MAX_DIGEST_HOURS} מועדים.
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
              disabled={viewer === undefined || savingDigestDays || savingDigestHours}
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
              disabled={viewer === undefined || savingDigestHours || atLimit}
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
  ) : null;

  const groupBlock =
    linkedPhone && useConvexPhone ? (
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm" dir="rtl">
        <p className="font-medium text-sky-950">קבוצת קליטה</p>
        <p className="mt-1 text-xs text-sky-800">
          חיבור לקבוצה קיימת בלבד. ברירת המחדל: שם המשתמש.
        </p>

        {greenStatus?.restricted || greenStatus?.stateInstance === "yellowCard" ? (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">
            <p className="font-medium">
              {greenStatus.stateInstance === "yellowCard"
                ? "הגבלת Green-API (yellowCard)"
                : "חיבור וואטסאפ דורש חידוש"}
            </p>
            <p className="mt-1 text-xs leading-relaxed">
              {greenStatus.hint ||
                "סרקו QR מחדש בקונסולת Green-API כדי לחדש את החיבור."}
            </p>
          </div>
        ) : null}

        {groupConnected ? (
          <div className="mt-3 rounded-lg border border-emerald-300 bg-white px-3 py-2">
            <p className="text-emerald-900">
              {captureIsPersonal ? "יעד קליטה: " : "מחובר לקבוצה: "}
              <strong>{viewer?.whatsappCaptureGroupName?.trim() || (captureIsPersonal ? "הודעה לעצמי" : "קבוצה")}</strong>
            </p>
            {captureIsPersonal ? (
              <p className="mt-1 text-xs text-amber-800">
                כרגע קליטה מ«הודעה לעצמי» בלבד. כדי לקלוט מקבוצת וואטסאפ — חפשו וחברו קבוצה למטה.
              </p>
            ) : null}
            <button
              type="button"
              className="mt-2 text-xs font-medium text-sky-800 underline"
              onClick={() => void handleDisconnectGroup()}
            >
              {captureIsPersonal ? "נתק יעד קליטה" : "נתק מהקבוצה"}
            </button>
          </div>
        ) : awaitingGroupMessage ? (
          <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">
            ממתין: שלחו הודעה בקבוצה הקיימת בוואטסאפ — היא תתחבר אוטומטית.
          </p>
        ) : (
          <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">
            עדיין לא מחובר לקבוצה — חפשו וחברו למטה.
          </p>
        )}

        <label className="mt-4 block text-xs font-medium text-sky-900">
          חיפוש קבוצה קיימת
        </label>
        <input
          type="search"
          placeholder="שם הקבוצה…"
          value={groupSearch}
          onChange={(e) => setGroupSearch(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-slate-900"
        />

        <button
          type="button"
          disabled={bindingGroup || !groupSearch.trim()}
          onClick={() => void handleBindExistingGroup()}
          className="mt-3 w-full rounded-lg bg-sky-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {bindingGroup
            ? "מחבר…"
            : `חבר קבוצה${groupSearch.trim() ? ` «${groupSearch.trim()}»` : ""}`}
        </button>
        <button
          type="button"
          onClick={() => void handleBindByGroupMessage()}
          className="mt-2 w-full rounded-lg border border-sky-300 bg-white px-3 py-2.5 text-sm font-semibold text-sky-900 hover:bg-sky-100"
        >
          חבר ע״י הודעה בקבוצה הקיימת
        </button>

        {hasGroupSearch ? (
          loadingGroups ? (
            <p className="mt-2 text-xs text-sky-700">מחפש…</p>
          ) : (
            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-sky-200 bg-white p-2">
              {filteredGroups.length === 0 ? (
                <p className="px-1 py-2 text-xs text-slate-500">לא נמצאה קבוצה תואמת.</p>
              ) : (
                filteredGroups.map((group) => {
                  const selected = viewer?.whatsappCaptureGroupChatId === group.chatId;
                  const busy = selectingGroupId === group.chatId;
                  return (
                    <button
                      key={group.chatId}
                      type="button"
                      disabled={Boolean(selectingGroupId)}
                      onClick={() => void handleSelectGroup(group.chatId, group.name)}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-right text-sm ${
                        selected
                          ? "bg-sky-100 font-semibold text-sky-900"
                          : "text-slate-800 hover:bg-sky-50"
                      } disabled:opacity-50`}
                    >
                      <span>{busy ? "מחבר…" : group.name}</span>
                      {selected ? (
                        <span className="text-xs text-sky-700">מחובר</span>
                      ) : (
                        <span className="text-xs text-sky-600">חבר</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )
        ) : (
          <p className="mt-1.5 text-xs text-sky-700">הקלידו חלק משם הקבוצה (למשל משימות).</p>
        )}
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
            שלחו הודעות לקבוצת הקליטה שבוחרים למטה — רק ההודעות שלכם נקלטות.
          </p>
        </div>
        {groupBlock}
        {digestBlock}
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </ChannelInfoPanel>
    );
  }

  return (
    <ChannelInfoPanel channelId="whatsapp" summary={summary} compact>
      <p className="text-sm text-slate-600" dir="rtl">
        חברו מספר וואטסאפ — ואז חברו קבוצה קיימת לקליטה.
      </p>
      {digestBlock}

      {!useConvexPhone && profile?.phone_pending ? (
        <p className="text-sm text-amber-700">
          ממתין לאימות: <span dir="ltr">{profile.phone_pending}</span>
        </p>
      ) : null}

      {useConvexPhone ? (
        <form onSubmit={handleConvexLink} className="space-y-3">
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
            disabled={loading || !convexReady}
            className="w-full rounded-lg bg-blue-600 px-3 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {convexReady ? "חבר מספר" : "מכין חיבור..."}
          </button>
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
            className="w-full rounded-lg bg-blue-600 px-3 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
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
            className="w-full rounded-lg bg-blue-600 px-3 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
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
