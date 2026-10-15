import type { UsageSummary } from "../lib/api";
import { ChannelInfoPanel } from "./ChannelInfoPanel";

interface NotebookScanSettingsProps {
  summary: UsageSummary | null;
}

export function NotebookScanSettings({ summary }: NotebookScanSettingsProps) {
  return (
    <ChannelInfoPanel channelId="notebook" summary={summary}>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        <p className="font-medium">הסריקה פעילה</p>
        <p className="mt-1 text-emerald-800">
          במחברת לחצו על אייקון התמונה וצלמו דף או פתק. אפשר גם לשלוח תמונה לקבוצת
          הוואטסאפ. כתב דפוס וכתב יד נתמכים. אין מגבלת מילים קשיחה — עמוד אחד
          לתמונה (עד כ־1,500 מילים).
        </p>
      </div>
    </ChannelInfoPanel>
  );
}
