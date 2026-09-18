import { useEffect, useState } from "react";

import { BoardSettingsPanel } from "./BoardSettingsPanel";
import { GoogleCalendarLink } from "./GoogleCalendarLink";
import { NotebookScanSettings } from "./NotebookScanSettings";
import { NotificationPrefs } from "./NotificationPrefs";
import { PhoneLinkSettings } from "./PhoneLinkSettings";
import { TextCaptureSettings } from "./TextCaptureSettings";
import { VoiceRecordingSettings } from "./VoiceRecordingSettings";
import type { UsageSummary } from "../lib/api";
import { ONBOARDING_STEPS } from "../lib/onboarding-steps";
import {
  getCloudUserProfile,
  updateCloudUserProfile,
} from "../lib/user-profile";

interface OnboardingWizardProps {
  enabled: boolean;
  userId: string;
  summary: UsageSummary | null;
}

export function OnboardingWizard({ enabled, userId, summary }: OnboardingWizardProps) {
  const [visible, setVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }
    let cancelled = false;
    void getCloudUserProfile()
      .then((profile) => {
        if (!cancelled) {
          setVisible(!profile.onboarding_completed_at);
          setStepIndex(0);
        }
      })
      .catch(() => {
        if (!cancelled) setVisible(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!visible) return null;

  const step = ONBOARDING_STEPS[stepIndex] ?? ONBOARDING_STEPS[0];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === ONBOARDING_STEPS.length - 1;

  async function complete() {
    setBusy(true);
    setError(null);
    try {
      await updateCloudUserProfile({
        onboarding_completed_at: new Date().toISOString(),
      });
      setVisible(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא ניתן לשמור את סיום ההגדרה");
    } finally {
      setBusy(false);
    }
  }

  function goNext() {
    if (isLast) {
      void complete();
      return;
    }
    setStepIndex((index) => Math.min(index + 1, ONBOARDING_STEPS.length - 1));
  }

  function goBack() {
    setStepIndex((index) => Math.max(index - 1, 0));
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white p-4 shadow-xl"
        role="dialog"
        aria-labelledby="onboarding-title"
        dir="rtl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium text-indigo-700">
              שלב {stepIndex + 1} מתוך {ONBOARDING_STEPS.length}
            </p>
            <h2 id="onboarding-title" className="text-base font-bold text-slate-900">
              {step.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => void complete()}
            disabled={busy}
            className="shrink-0 border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-60"
          >
            דלג על הכל
          </button>
        </div>

        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-indigo-500"
            style={{ width: `${((stepIndex + 1) / ONBOARDING_STEPS.length) * 100}%` }}
          />
        </div>

        <p className="mb-1 text-sm text-slate-600">{step.body}</p>
        <p className="mb-3 text-xs text-slate-500">אפשר לשנות את זה אחר כך בהגדרות.</p>
        {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}

        <div className="min-h-[16rem] flex-1 overflow-y-auto pb-2">
          {step.settingsSection === "notifications" ? <NotificationPrefs compact /> : null}
          {step.settingsSection === "whatsapp" ? (
            <PhoneLinkSettings userId={userId} summary={summary} />
          ) : null}
          {step.settingsSection === "voice" ? <VoiceRecordingSettings summary={summary} /> : null}
          {step.settingsSection === "notebook" ? <NotebookScanSettings summary={summary} /> : null}
          {step.settingsSection === "text" ? <TextCaptureSettings summary={summary} /> : null}
          {step.settingsSection === "boards" ? <BoardSettingsPanel /> : null}
          {step.settingsSection === "calendar" ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                משימות עם תאריך נכנסות ליומן Google. הערות בלי תאריך נשארות רק ב-BabiTk.
              </p>
              <GoogleCalendarLink />
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={goBack}
            disabled={isFirst || busy}
            className="border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40"
          >
            חזור
          </button>
          <div className="flex gap-2">
            {!isLast ? (
              <button
                type="button"
                onClick={goNext}
                disabled={busy}
                className="border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-60"
              >
                דלג
              </button>
            ) : null}
            <button
              type="button"
              onClick={goNext}
              disabled={busy}
              className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-60"
            >
              {busy ? "שומר..." : isLast ? "סיום והתחלה" : isFirst ? "בואו נתחיל" : "המשך"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
