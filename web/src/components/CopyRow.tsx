import { useState } from "react";

export function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-slate-600">{label}</p>
      <div className="flex items-start gap-2">
        <code className="block min-w-0 flex-1 break-all rounded-lg bg-white px-2 py-1 text-xs text-slate-800">
          {value}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 border border-slate-300 px-2 py-1 text-xs hover:bg-white"
        >
          {copied ? "הועתק" : "העתק"}
        </button>
      </div>
    </div>
  );
}
