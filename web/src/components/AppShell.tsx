import { useState, type ReactNode } from "react";

import { useReminderAlerts } from "../hooks/useReminderAlerts";
import { useUserNotifications } from "../hooks/useUserNotifications";
import { isSupabaseConfigured } from "../lib/supabase";
import { ensureBrowserNotificationPermission } from "../lib/reminder-chime";
import { requestOpenItem } from "../lib/user-notifications";
import { formatUserHeaderName, type UserNameParts } from "../lib/user-display-name";
import { AppHeader } from "./AppHeader";
import { BoardViewToggle } from "./BoardViewToggle";
import { NotificationsPanel } from "./NotificationsPanel";
import { SystemActivityButton } from "./SystemActivityButton";
import { SystemActivityPanel } from "./SystemActivityPanel";
import { QuickCapture } from "./QuickCapture";
import { snoozeReminderAlert } from "../lib/reminder-alert-snooze";
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
  onOpenNotificationItem,
  beforeMain,
  children,
  notifications,
}: AppShellProps & { notifications?: ReactNode }) {
  const [activityOpen, setActivityOpen] = useState(false);
  const ownerName = userName ? formatUserHeaderName(userName) : "";

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
            <button
              type="button"
              className="app-header-nav-link"
              onClick={onSettings}
              aria-label="הגדרות"
              title="הגדרות"
            >
              <svg
                className="h-5 w-5 sm:hidden"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span className="hidden sm:inline">הגדרות</span>
            </button>
            <button
              type="button"
              className="app-header-nav-link"
              onClick={onLogout}
              aria-label="התנתק"
              title="התנתק"
            >
              <svg
                className="h-5 w-5 sm:hidden"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span className="hidden sm:inline">התנתק</span>
            </button>
          </>
        }
      >
        <BoardViewToggle />
        {userId ? (
          <SystemActivityButton
            pressed={activityOpen}
            onClick={() => setActivityOpen(true)}
          />
        ) : null}
      </AppHeader>

      {beforeMain ? <div className="shrink-0">{beforeMain}</div> : null}

      <main className="notebook-main relative z-[1] mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col overflow-hidden px-3 pt-1 sm:px-3 sm:pt-1.5 lg:px-4 lg:pt-2">
        {children}
      </main>

      {userId ? (
        <SystemActivityPanel
          open={activityOpen}
          userId={userId}
          ownerName={ownerName}
          onClose={() => setActivityOpen(false)}
          onOpenItem={(itemId) => {
            if (onOpenNotificationItem) {
              onOpenNotificationItem(itemId);
            } else {
              requestOpenItem(itemId);
            }
            setActivityOpen(false);
          }}
        />
      ) : null}
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
        onOpenNotificationItem={onOpenNotificationItem}
        beforeMain={beforeMain}
        notifications={
          notifications.notifyInApp ? (
            <button
              type="button"
              className="app-header-bell relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-stone-300/80 bg-white/70 text-stone-800 shadow-sm transition hover:bg-stone-100 hover:text-stone-950 sm:h-9 sm:w-9 lg:w-auto lg:gap-1.5 lg:px-2.5"
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
        onSnooze={(kind) => {
          const itemId = reminderAlerts.alert?.itemId;
          void snoozeReminderAlert(itemId, kind).finally(() => {
            void reminderAlerts.acknowledge();
          });
        }}
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
