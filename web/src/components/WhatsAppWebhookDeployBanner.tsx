import { useEffect, useState } from "react";

import {
  GITHUB_ACTIONS_SECRETS_URL,
  SUPABASE_ACCESS_TOKEN_URL,
  WHATSAPP_WEBHOOK_DEPLOY_WORKFLOW_URL,
  liveWhatsAppQuestionsReady,
} from "../lib/whatsapp-webhook-health";

export function WhatsAppWebhookDeployBanner() {
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void liveWhatsAppQuestionsReady().then((ok) => {
      if (!cancelled) setReady(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (ready !== false) return null;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" dir="rtl">
      <p className="font-semibold">שאלות בקבוצה עדיין לא פעילות בשרת החי</p>
      <p className="mt-1 text-xs leading-5 text-amber-900">
        הקוד כבר בגיטהאב, אבל פונקציית הוואטסאפ לא עלתה כי חסר טוקן פריסה. בלי זה `*` / `?` / «בבי»
        נכנסים כפריט במקום לקבל מענה בקבוצה.
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
