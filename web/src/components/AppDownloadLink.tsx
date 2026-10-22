import { BABITK_APK_LABEL, BABITK_APK_URL } from "../../../convex/lib/babitkApk";

export function AppDownloadLink({ className }: { className?: string }) {
  return (
    <a href={BABITK_APK_URL} className={className} rel="noreferrer">
      {BABITK_APK_LABEL}
    </a>
  );
}
