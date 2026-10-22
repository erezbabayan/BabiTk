import { useEffect, useState } from "react";
import { toDataURL } from "qrcode";

import {
  BABISNAP_COPY,
  babisnapDownloadUrl,
  babisnapPairLink,
  formatBabisnapLastUsed,
} from "../../../convex/lib/babisnap";
import { babisnapAction } from "../lib/babisnap-client";

function useDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 800px)");
    const apply = () => setDesktop(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return desktop;
}

function QrImage({ value, label }: { value: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void toDataURL(value, { margin: 1, width: 180, errorCorrectionLevel: "M" })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);
  if (!src) return null;
  return <img src={src} alt={label} width={180} height={180} className="mx-auto rounded-lg border border-slate-200 bg-white p-2" />;
}

function hebrewError(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "unauthorized") return "יש להתחבר מחדש";
  return "לא הצלחנו. נסו שוב.";
}

export function BabiSnapSettings() {
  const desktop = useDesktop();
  const downloadUrl = babisnapDownloadUrl();
  const [connected, setConnected] = useState(false);
  const [lastUsedAt, setLastUsedAt] = useState<string | null>(null);
  const [pairLink, setPairLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void babisnapAction("status")
      .then((status) => {
        if (cancelled) return;
        setConnected(status.connected);
        setLastUsedAt(status.lastUsedAt);
      })
      .catch((err) => {
        if (!cancelled) setError(hebrewError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const lastLabel = formatBabisnapLastUsed(lastUsedAt);

  async function connect() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const status = await babisnapAction("connect");
      const link = status.token ? babisnapPairLink(status.token) : null;
      setPairLink(link);
      setConnected(true);
      setLastUsedAt(null);
    } catch (err) {
      setError(hebrewError(err));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm(BABISNAP_COPY.disconnectConfirm)) return;
    setBusy(true);
    setError(null);
    setPairLink(null);
    try {
      const status = await babisnapAction("disconnect");
      setConnected(status.connected);
      setLastUsedAt(status.lastUsedAt);
    } catch (err) {
      setError(hebrewError(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!pairLink) return;
    try {
      await navigator.clipboard.writeText(pairLink);
      setCopied(true);
    } catch {
      setError("לא ניתן להעתיק");
    }
  }

  if (loading) return <p className="text-sm text-slate-500">טוען...</p>;

  return (
    <div className="space-y-3 text-sm" dir="rtl">
      <p className={`font-semibold ${connected ? "text-emerald-700" : "text-slate-700"}`}>
        {connected ? BABISNAP_COPY.connected : BABISNAP_COPY.disconnected}
      </p>
      {connected ? (
        <p className="text-slate-600">
          {lastLabel ? `${BABISNAP_COPY.lastPrefix}: ${lastLabel}` : BABISNAP_COPY.noneYet}
        </p>
      ) : null}

      {!connected && downloadUrl ? (
        <div className="space-y-2">
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="block rounded-lg bg-emerald-700 px-3 py-3 text-center text-sm font-bold text-white hover:bg-emerald-800"
          >
            {BABISNAP_COPY.download}
          </a>
          <p className="text-xs leading-5 text-slate-500">{BABISNAP_COPY.installNote}</p>
          {desktop ? <QrImage value={downloadUrl} label={BABISNAP_COPY.downloadQr} /> : null}
        </div>
      ) : null}

      {pairLink ? (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-600">{BABISNAP_COPY.once}</p>
          <a
            href={pairLink}
            className="block rounded-lg bg-slate-900 px-3 py-4 text-center text-base font-bold text-white hover:bg-slate-800"
          >
            {BABISNAP_COPY.open}
          </a>
          <p className="text-xs text-slate-500">{BABISNAP_COPY.hint}</p>
          {desktop ? <QrImage value={pairLink} label={BABISNAP_COPY.pairQr} /> : null}
          <button type="button" onClick={() => void copyLink()} className="text-xs text-slate-500 underline">
            {copied ? BABISNAP_COPY.copied : BABISNAP_COPY.copy}
          </button>
        </div>
      ) : null}

      {error ? <p className="text-red-600">{error}</p> : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => void connect()}
        className="w-full rounded-lg bg-slate-900 px-3 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {BABISNAP_COPY.connect}
      </button>
      {connected ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void disconnect()}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {BABISNAP_COPY.disconnect}
        </button>
      ) : null}
    </div>
  );
}
