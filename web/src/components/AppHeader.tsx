import type { ReactNode } from "react";

import { MindTaskerLogo } from "./MindTaskerLogo";

interface AppHeaderProps {
  children?: ReactNode;
  center?: ReactNode;
}

/** Logo left, quick capture centered on the bar, actions right (LTR bar in RTL app). */
export function AppHeader({ children, center }: AppHeaderProps) {
  return (
    <header
      dir="ltr"
      className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-1.5 backdrop-blur-sm"
    >
      <div className="relative flex min-h-9 items-center justify-between gap-2">
        <div className="z-10 shrink-0">
          <MindTaskerLogo size="large" />
        </div>

        {center ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-[5.5rem] sm:px-48">
            <div className="pointer-events-auto w-full max-w-[17rem] sm:max-w-xs">{center}</div>
          </div>
        ) : null}

        {children ? (
          <div className="z-10 flex shrink-0 items-center justify-end gap-2">{children}</div>
        ) : null}
      </div>
    </header>
  );
}
