import type { ReactNode } from "react";

import type { UserNameParts } from "../lib/user-display-name";
import { MindTaskerLogo } from "./MindTaskerLogo";
import { UserHeaderName } from "./UserHeaderName";

interface AppHeaderProps {
  /** Leading action(s) in the right cluster — e.g. board view toggle. */
  children?: ReactNode;
  /** Middle of the actions cluster — kept away from quick capture. */
  notifications?: ReactNode;
  /** Trailing links — e.g. settings / logout. */
  trailing?: ReactNode;
  center?: ReactNode;
  userName?: UserNameParts | null;
  onLogoClick?: () => void;
}

/**
 * Notebook header (LTR bar inside RTL app):
 * Logo left · quick capture center · actions right.
 * Single React tree (no duplicate QuickCapture mounts on mobile+desktop).
 */
export function AppHeader({
  children,
  notifications,
  trailing,
  center,
  userName,
  onLogoClick,
}: AppHeaderProps) {
  const logo = (
    <div className="shrink-0">
      {onLogoClick ? (
        <button
          type="button"
          onClick={onLogoClick}
          className="rounded-md border-0 bg-transparent p-0 transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400/50"
          aria-label="חזרה למסך הראשי"
        >
          <MindTaskerLogo size="medium" />
        </button>
      ) : (
        <MindTaskerLogo size="medium" />
      )}
    </div>
  );

  const actions = (
    <div className="flex shrink-0 items-center justify-end gap-2.5 sm:gap-3.5">
      {children ? (
        <nav className="app-header-nav flex items-center gap-1">{children}</nav>
      ) : null}
      {notifications ? (
        <div className="mx-1 flex shrink-0 items-center sm:mx-2">{notifications}</div>
      ) : null}
      {trailing ? (
        <nav className="app-header-nav flex items-center gap-1">{trailing}</nav>
      ) : null}
      {userName ? (
        <div className="hidden lg:block">
          <UserHeaderName name={userName} variant="notebook" />
        </div>
      ) : null}
    </div>
  );

  return (
    <header
      dir="ltr"
      className="app-header z-30 shrink-0 px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5"
    >
      <div className="mx-auto grid max-w-[1600px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 lg:gap-x-6 xl:gap-x-10">
        <div className="col-start-1 row-start-1">{logo}</div>
        <div className="col-start-3 row-start-1 justify-self-end">{actions}</div>
        {center ? (
          <div className="col-span-3 row-start-2 min-w-0 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:justify-self-stretch lg:px-3">
            <div className="w-full lg:mx-auto lg:max-w-xl">{center}</div>
          </div>
        ) : (
          <div className="hidden lg:col-start-2 lg:row-start-1 lg:block" />
        )}
      </div>
    </header>
  );
}
