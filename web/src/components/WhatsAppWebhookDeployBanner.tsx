import { useEffect, useState, type FormEvent } from "react";

import { isAppOwnerAccount } from "../lib/auth-account";
import {
  liveMintReportsOwnerRepair,
  repairDeployToken,
  repairErrorMessage,
  isSupabasePat,
  SUPABASE_ACCESS_TOKEN_URL,
} from "../lib/repair-deploy-token";
import { isDemoMode, requireSupabase } from "../lib/supabase";
import {
  WHATSAPP_WEBHOOK_DEPLOY_WORKFLOW_URL,
  liveWhatsAppQuestionsReady,
} from "../lib/whatsapp-webhook-health";

export function WhatsAppWebhookDeployBanner() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [owner, setOwner] = useState(false);
  const [mintRepair, setMintRepair] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void liveWhatsAppQuestionsReady().then((live) => {
      if (!cancelled) setReady(live);
    });
    const supabaseUrl = String(import.meta.env?.VITE_SUPABASE_URL ?? "");
    void liveMintReportsOwnerRepair(supabaseUrl).then((supported) => {
      if (!cancelled) setMintRepair(supported);
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

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = token.trim();
    if (!isSupabasePat(trimmed)) {
      setOk(false);
      setMessage("הדביקו טוקן שמתחיל ב-sbp_.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const supabase = requireSupabase();
      const [{ data }, supabaseUrl, anonKey] = await Promise.all([
        supabase.auth.getSession(),
        Promise.resolve(String(import.meta.env?.VITE_SUPABASE_URL ?? "")),
        Promise.resolve(String(import.meta.env?.VITE_SUPABASE_ANON_KEY ?? "")),
      ]);
      const userAccessToken = data.session?.access_token ?? "";
      if (!userAccessToken) {
        setOk(false);
        setMessage("התחברו שוב ואז הדביקו את הטוקן.");
        return;
      }
      const result = await repairDeployToken({
        supabaseUrl,
        anonKey,
        userAccessToken,
        managementToken: trimmed,
      });
      if (!result.ok) {
        setOk(false);
        setMessage(repairErrorMessage(result.error));
        return;
      }
      setOk(true);
      setToken("");
      setMessage("הטוקן נשמר והוובהוק עלה. שלחו שוב את המשימה בוואטסאפ.");
      const live = await liveWhatsAppQuestionsReady();
      setReady(live);
    } catch {
      setOk(false);
      setMessage(repairErrorMessage("repair_failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" dir="rtl">
      <p className="font-semibold">קליטת משימות מהקבוצה עדיין לא פעילה בשרת החי</p>
      <p className="mt-1 text-xs leading-5 text-amber-900">
        הטוקן לפריסת הוובהוק פג, לכן תיקוני הקבוצה בגיטהאב לא עולים. צרו טוקן חדש והדביקו אותו כאן —
        בלי לעבור ב-GitHub Secrets.
      </p>
      <ol className="mt-2 list-decimal space-y-1 pr-4 text-xs leading-5 text-amber-950">
        <li>
          צרו טוקן ב-
          <a className="font-semibold underline" href={SUPABASE_ACCESS_TOKEN_URL} target="_blank" rel="noreferrer">
            Supabase Account Tokens
          </a>
        </li>
        <li>הדביקו אותו למטה. אם השדה נכשל, הדביקו אותו חד-פעמית ב-Run workflow.</li>
      </ol>
      <form className="mt-3 flex flex-col gap-2" onSubmit={onSubmit}>
        <input
          type="password"
          name="supabase-access-token"
          autoComplete="off"
          dir="ltr"
          placeholder="sbp_..."
          value={token}
          onChange={(event) => setToken(event.target.value)}
          className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-stone-900"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-amber-900 px-3 py-2 text-sm font-semibold text-amber-50 disabled:opacity-60"
        >
          {busy ? "מפעיל קליטה..." : "הפעל קליטה"}
        </button>
      </form>
      {message ? (
        <p className={`mt-2 text-xs leading-5 ${ok ? "text-emerald-800" : "text-amber-950"}`}>{message}</p>
      ) : null}
      {!mintRepair ? (
        <p className="mt-2 text-xs leading-5 text-amber-900">
          עד שהשרת החי יקבל טוקן מכאן, הדביקו אותו ב-
          <a
            className="font-semibold underline"
            href={WHATSAPP_WEBHOOK_DEPLOY_WORKFLOW_URL}
            target="_blank"
            rel="noreferrer"
          >
            Deploy Supabase Functions
          </a>{" "}
          (Run workflow).
        </p>
      ) : null}
    </div>
  );
}
