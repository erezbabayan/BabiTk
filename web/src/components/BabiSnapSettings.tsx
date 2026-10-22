import { useEffect, useRef, useState } from "react";
import { toDataURL } from "qrcode";

import {
  BABISNAP_COPY,
  babisnapDownloadUrl,
  babisnapOpenLink,
  babisnapPairPageUrl,
  babisnapStatusLabel,
} from "../../../convex/lib/babisnap";
import logo from "../assets/babisnap-logo.webp";
import { babisnapAction } from "../lib/babisnap-client";

function useDesktop(): boolean {
  const [desktop, setDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 800px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(min-width: 800px)");
    const apply = () => setDesktop(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return desktop;
}

function QrImage({ value, label, width = 180 }: { value: string; label: string; width?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void toDataURL(value, { margin: 1, width, errorCorrectionLevel: "M" })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, width]);
  if (!src) return null;
  return (
    <img
      src={src}
      alt={label}
      width={width}
      height={width}
      className="mx-auto rounded-lg border border-slate-200 bg-white p-2"
    />
  );
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
  const busyRef = useRef(false);

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

  const statusLabel = babisnapStatusLabel({ connected, lastUsedAt });
  const showDownload = !lastUsedAt && Boolean(downloadUrl);

  function connectAndOpen() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setCopied(false);
    const pending = desktop ? null : window.open("about:blank", "_blank");
    const userAgent = navigator.userAgent;
    void (async () => {
      try {
        const status = await babisnapAction("connect");
        const openLink = status.token ? babisnapOpenLink(status.token, userAgent) : null;
        setPairLink(status.token ? babisnapPairPageUrl(status.token) : null);
        setConnected(true);
        setLastUsedAt(null);
        if (!desktop && openLink) {
          if (pending) pending.location.href = openLink;
          else window.location.assign(openLink);
        } else {
          pending?.close();
        }
      } catch (err) {
        pending?.close();
        setError(hebrewError(err));
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    })();
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
      <div className="flex items-center gap-2">
        <img src={logo} alt="" width={32} height={32} className="h-8 w-8 rounded-full" />
        <h2 className="text-base font-bold text-slate-900">BabiSnap</h2>
      </div>
      {statusLabel ? (
        <p className={`font-semibold ${lastUsedAt ? "text-emerald-700" : "text-slate-700"}`}>
          {statusLabel}
        </p>
      ) : null}

      {showDownload && downloadUrl ? (
        <div className="space-y-2">
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="block rounded-lg border border-emerald-700 px-3 py-2 text-center text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
          >
            {BABISNAP_COPY.download}
          </a>
          <p className="text-xs leading-5 text-slate-500">{BABISNAP_COPY.installNote}</p>
          {desktop ? <QrImage value={downloadUrl} label={BABISNAP_COPY.downloadQr} /> : null}
        </div>
      ) : null}

      {desktop && pairLink ? (
        <QrImage value={pairLink} label={BABISNAP_COPY.pairQr} width={260} />
      ) : null}
      {error ? <p className="text-red-600">{error}</p> : null}

      <button
        type="button"
        disabled={busy}
        onClick={connectAndOpen}
        className="w-full rounded-lg bg-slate-900 px-3 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {BABISNAP_COPY.connect}
      </button>
      {pairLink ? (
        <button type="button" onClick={() => void copyLink()} className="text-xs text-slate-500 underline">
          {copied ? BABISNAP_COPY.copied : BABISNAP_COPY.copyManual}
        </button>
      ) : null}
      {connected ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void disconnect()}
          className="block text-xs text-slate-500 underline disabled:opacity-50"
        >
          {BABISNAP_COPY.disconnect}
        </button>
      ) : null}
    </div>
  );
}
