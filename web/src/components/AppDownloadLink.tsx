import { BABITK_APK_LABEL, BABITK_APK_URL } from "../../../convex/lib/babitkApk";
import { MindTaskerLogo } from "./MindTaskerLogo";

export function AppDownloadLink({ className, logo = false }: { className?: string; logo?: boolean }) {
  return (
    <a href={BABITK_APK_URL} className={className} rel="noreferrer">
      {logo ? (
        <span className="inline-flex items-center justify-center gap-1.5">
          <span>{BABITK_APK_LABEL}</span>
          <span aria-hidden>
            <MindTaskerLogo
              variant="mark"
              size="small"
              className="!h-[20px] !w-auto [&_svg]:h-[20px] [&_svg]:w-auto"
            />
          </span>
        </span>
      ) : (
        BABITK_APK_LABEL
      )}
    </a>
  );
}
