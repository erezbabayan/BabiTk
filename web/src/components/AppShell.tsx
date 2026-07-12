import type { ReactNode } from "react";

import type { UserNameParts } from "../lib/user-display-name";
import { AppHeader } from "./AppHeader";
import { BoardViewToggle } from "./BoardViewToggle";
import { QuickCapture } from "./QuickCapture";

interface AppShellProps {
  userName?: UserNameParts | null;
  userId: string | null;
  onLogoClick?: () => void;
  onSettings: () => void;
  onLogout: () => void;
  onCaptured: () => void;
  beforeMain?: ReactNode;
  children: ReactNode;
}

/** Hybrid notebook layout — dark header, pill capture, paper boards. */
export function AppShell({
  userName,
  userId,
  onLogoClick,
  onSettings,
  onLogout,
  onCaptured,
  beforeMain,
  children,
}: AppShellProps) {
  return (
    <div className="notebook-app relative flex h-dvh max-h-dvh flex-col overflow-hidden">
      <AppHeader
        userName={userName}
        onLogoClick={onLogoClick}
        center={
          userId ? (
            <QuickCapture userId={userId} onCaptured={onCaptured} variant="compact" />
          ) : null
        }
      >
        <BoardViewToggle />
        <button type="button" className="app-header-nav-link" onClick={onSettings}>
          הגדרות
        </button>
        <button type="button" className="app-header-nav-link" onClick={onLogout}>
          התנתק
        </button>
      </AppHeader>

      {beforeMain ? <div className="shrink-0">{beforeMain}</div> : null}

      <main className="notebook-main relative z-[1] mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col overflow-hidden px-2 pt-1 sm:px-4 sm:pt-2">
        {children}
      </main>
    </div>
  );
}
