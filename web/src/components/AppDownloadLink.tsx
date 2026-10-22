import { BABITK_APK_LABEL, BABITK_APK_URL } from "../../../convex/lib/babitkApk";
import babitkLogo from "../assets/babitk-logo.webp";

export function AppDownloadLink({ className, logo = false }: { className?: string; logo?: boolean }) {
  return (
    <a href={BABITK_APK_URL} className={className} rel="noreferrer">
      {logo ? (
        <span className="inline-flex items-center justify-center gap-1.5">
          <img
            src={babitkLogo}
            alt=""
            width={20}
            height={20}
            className="h-[20px] w-[20px] shrink-0 rounded-[4px]"
          />
          <span>{BABITK_APK_LABEL}</span>
        </span>
      ) : (
        BABITK_APK_LABEL
      )}
    </a>
  );
}
