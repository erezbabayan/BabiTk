import type { ReactNode } from "react";
import type { UsageSummary } from "../lib/api";
import {
  CHANNELS,
  formatAiUsage,
  formatAudioUsage,
  type ChannelInfo,
} from "../lib/channel-info";

interface ChannelInfoPanelProps {
  channelId: keyof typeof CHANNELS;
  summary?: UsageSummary | null;
  children?: ReactNode;
}

function LimitsList({ channel, summary }: { channel: ChannelInfo; summary?: UsageSummary | null }) {
  const liveRows =
    summary && !summary.isPremium
      ? [
          ...(channel.id === "voice" || channel.id === "whatsapp"
            ? [{ label: "מכסת תמלול (נוכחית)", value: formatAudioUsage(summary) }]
            : []),
          { label: "מכסת AI (נוכחית)", value: formatAiUsage(summary) },
        ]
      : summary?.isPremium
        ? [{ label: "מנוי", value: "Premium — ללא הגבלת מכסה" }]
        : [];

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
      <p className="mb-2 font-medium text-slate-800">מגבלות ומכסות</p>
      <dl className="space-y-1.5">
        {channel.limits.map((row) => (
          <div key={row.label} className="flex justify-between gap-3 text-slate-700">
            <dt className="shrink-0 text-slate-500">{row.label}</dt>
            <dd className="text-left">{row.value}</dd>
          </div>
        ))}
        {liveRows.map((row) => (
          <div key={row.label} className="flex justify-between gap-3 font-medium text-slate-800">
            <dt className="shrink-0 text-slate-600">{row.label}</dt>
            <dd className="text-left">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ChannelInfoPanel({ channelId, summary, children }: ChannelInfoPanelProps) {
  const channel = CHANNELS[channelId];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-600">{channel.description}</p>
        <p className="mt-1 text-xs text-slate-500">זמין ב: {channel.platforms}</p>
      </div>

      {children}

      <LimitsList channel={channel} summary={summary} />

      {channel.notes?.length ? (
        <ul className="list-inside list-disc space-y-1 text-xs text-slate-500">
          {channel.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
