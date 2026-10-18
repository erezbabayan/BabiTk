import { useEffect, useState } from "react";

import { isAppOwnerAccount } from "../lib/auth-account";
import { isDemoMode, requireSupabase } from "../lib/supabase";
import {
  GITHUB_ACTIONS_SECRETS_URL,
  SUPABASE_ACCESS_TOKEN_URL,
  WHATSAPP_WEBHOOK_DEPLOY_WORKFLOW_URL,
  liveWhatsAppQuestionsReady,
} from "../lib/whatsapp-webhook-health";

export function WhatsAppWebhookDeployBanner() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [owner, setOwner] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void liveWhatsAppQuestionsReady().then((ok) => {
      if (!cancelled) setReady(ok);
    });
    if (isDemoMode) {
      setOwner(false);
    } else {
      void requireSupabase()
        .auth.getSession()
        .then(({ data }) => {
          if (cancelled) return;
          const user = data.session?.user;
          const username =
            typeof user?.user_metadata?.username === "string"
              ? user.user_metadata.username
              : null;
          setOwner(isAppOwnerAccount({ email: user?.email, username }));
        })
        .catch(() => {
          if (!cancelled) setOwner(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  if (!owner || ready !== false) return null;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" dir="rtl">
      <p className="font-semibold">קליטת משימות מהקבוצה עדיין לא פעילה בשרת החי</p>
      <p className="mt-1 text-xs leading-5 text-amber-900">
        הוובהוק החי לא עודכן, לכן הודעות כמו משימות לקבלן נזרקות ולא מגיעות למחברת. צריך טוקן פריסה
        תקין של Supabase — בלי זה התיקון בגיטהאב לא עולה.
      </p>
      <ol className="mt-2 list-decimal space-y-1 pr-4 text-xs leading-5 text-amber-950">
        <li>
          צרו טוקן ב-
          <a className="font-semibold underline" href={SUPABASE_ACCESS_TOKEN_URL} target="_blank" rel="noreferrer">
            Supabase Account Tokens
          </a>
        </li>
        <li>
          שמרו אותו כ-GitHub Secret בשם{" "}
          <code className="rounded bg-white px-1">SUPABASE_ACCESS_TOKEN</code> ב-
          <a className="font-semibold underline" href={GITHUB_ACTIONS_SECRETS_URL} target="_blank" rel="noreferrer">
            Secrets
          </a>
        </li>
        <li>
          הרצו{" "}
          <a
            className="font-semibold underline"
            href={WHATSAPP_WEBHOOK_DEPLOY_WORKFLOW_URL}
            target="_blank"
            rel="noreferrer"
          >
            Deploy Supabase Functions
          </a>{" "}
          (Run workflow) — או הדביקו את הטוקן שם חד-פעמית.
        </li>
      </ol>
    </div>
  );
}
