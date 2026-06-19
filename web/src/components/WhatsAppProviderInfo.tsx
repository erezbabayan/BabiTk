import type { WhatsAppProviderStatus } from "../lib/api";

interface WhatsAppProviderInfoProps {
  status: WhatsAppProviderStatus | null;
}

export function WhatsAppProviderInfo({ status }: WhatsAppProviderInfoProps) {
  if (!status) return null;

  return (
    <div
      className={`mb-4 rounded-lg border p-3 text-sm ${
        status.configured
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <p className="font-medium">ספק: {status.label}</p>
      <p className="mt-1 text-xs opacity-90">
        {status.configured
          ? "השרת מוכן לקבל הודעות מוואטסאפ."
          : "השרת עדיין לא מוגדר — קוד אימות עלול להיכשל."}
      </p>
      {status.provider !== "meta" ? (
        <p className="mt-2 text-xs opacity-80" dir="ltr">
          Webhook: {status.inboundWebhookPath}
        </p>
      ) : null}
    </div>
  );
}
