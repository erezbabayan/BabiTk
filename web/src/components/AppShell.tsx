import { useState, type ReactNode } from "react";

import { useReminderAlerts } from "../hooks/useReminderAlerts";
import { useUserNotifications } from "../hooks/useUserNotifications";
import { isSupabaseConfigured } from "../lib/supabase";
import { ensureBrowserNotificationPermission } from "../lib/reminder-chime";
import { requestOpenItem } from "../lib/user-notifications";
import type { UserNameParts } from "../lib/user-display-name";
import { AppHeader } from "./AppHeader";
import { BoardViewToggle } from "./BoardViewToggle";
import { NotificationsPanel } from "./NotificationsPanel";
import { QuickCapture } from "./QuickCapture";
import { ReminderAlertModal } from "./ReminderAlertModal";

interface AppShellProps {
  userName?: UserNameParts | null;
  userId: string | null;
  onLogoClick?: () => void;
  onSettings: () => void;
  onLogout: () => void;
  onCaptured: () => void;
  onOpenNotificationItem?: (itemId: string) => void;
  beforeMain?: ReactNode;
  children: ReactNode;
}

function AppShellChrome({
  userName,
  userId,
  onLogoClick,
  onSettings,
  onLogout,
  onCaptured,
  beforeMain,
  children,
  notifications,
}: AppShellProps & { notifications?: ReactNode }) {
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
        notifications={notifications}
        trailing={
          <>
            <button type="button" className="app-header-nav-link" onClick={onSettings}>
              הגדרות
            </button>
            <button type="button" className="app-header-nav-link" onClick={onLogout}>
              התנתק
            </button>
          </>
        }
      >
        <BoardViewToggle />
      </AppHeader>

      {beforeMain ? <div className="shrink-0">{beforeMain}</div> : null}

      <main className="notebook-main relative z-[1] mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col overflow-hidden px-3 pt-1 sm:px-3 sm:pt-1.5 lg:px-4 lg:pt-2">
        {children}
      </main>
    </div>
  );
}

function AppShellWithNotifications({
  userName,
  userId,
  onLogoClick,
  onSettings,
  onLogout,
  onCaptured,
  onOpenNotificationItem,
  beforeMain,
  children,
}: AppShellProps) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notifications = useUserNotifications(userId, Boolean(userId));
  const reminderAlerts = useReminderAlerts(
    userId,
    Boolean(userId) && notifications.notifyInApp,
  );

  function openItem(itemId: string | null | undefined) {
    if (!itemId) return;
    if (onOpenNotificationItem) {
      onOpenNotificationItem(itemId);
      return;
    }
    requestOpenItem(itemId);
  }

  function openNotificationsPanel() {
    setNotificationsOpen(true);
    void ensureBrowserNotificationPermission();
  }

  return (
    <>
      <AppShellChrome
        userName={userName}
        userId={userId}
        onLogoClick={onLogoClick}
        onSettings={onSettings}
        onLogout={onLogout}
        onCaptured={onCaptured}
        beforeMain={beforeMain}
        notifications={
          notifications.notifyInApp ? (
            <button
              type="button"
              className="app-header-bell relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-stone-300/80 bg-white/70 text-stone-800 shadow-sm transition hover:bg-stone-100 hover:text-stone-950 lg:w-auto lg:gap-1.5 lg:px-2.5"
              onClick={openNotificationsPanel}
              aria-label="מרכז התראות"
              title="מרכז התראות — תזכורות"
            >
              <span aria-hidden className="text-base leading-none">
                🔔
              </span>
              <span className="hidden text-xs font-semibold lg:inline">התראות</span>
              {notifications.unread > 0 ? (
                <span className="absolute -top-1 -right-1 inline-flex min-w-[1.15rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white">
                  {notifications.unread > 9 ? "9+" : notifications.unread}
                </span>
              ) : null}
            </button>
          ) : null
        }
      >
        {children}
      </AppShellChrome>

      {userId ? (
        <NotificationsPanel
          open={notificationsOpen}
          rows={notifications.rows}
          onClose={() => setNotificationsOpen(false)}
          onMarkRead={(id) => void notifications.markRead(id)}
          onMarkAllRead={() => void notifications.markAllRead()}
          onOpenItem={(itemId) => {
            openItem(itemId);
            setNotificationsOpen(false);
          }}
        />
      ) : null}

      <ReminderAlertModal
        alert={reminderAlerts.alert}
        onDismiss={() => reminderAlerts.dismiss()}
        onAcknowledge={() => void reminderAlerts.acknowledge()}
        onOpen={() => openItem(reminderAlerts.alert?.itemId)}
      />
    </>
  );
}

export function AppShell(props: AppShellProps) {
  if (isSupabaseConfigured && props.userId) {
    return <AppShellWithNotifications {...props} />;
  }
  return <AppShellChrome {...props} />;
}
