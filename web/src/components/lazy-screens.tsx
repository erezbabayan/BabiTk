/**
 * Code-split screens. The login screen, the board, settings (BabiSnap QR, phone link,
 * Green API, admin, trash), onboarding, paywall and the Hebrew month calendar
 * (@hebcal + Temporal polyfill) each load only when needed.
 */
import { Suspense, type ComponentProps, type ReactNode } from "react";
import { chunkLoader, lazyNamed } from "../lib/lazy-chunk";
import { hasStoredSupabaseSession } from "../lib/stored-session";

export const loadDashboard = chunkLoader(() => import("./Dashboard"));
export const loadLoginScreen = chunkLoader(() => import("./LoginScreen"));
export const loadSettingsPanel = chunkLoader(() => import("./SettingsPanel"));
export const loadOnboardingWizard = chunkLoader(() => import("./OnboardingWizard"));
export const loadPaywallModal = chunkLoader(() => import("./PaywallModal"));
export const loadTaskMonthCalendar = chunkLoader(() => import("./TaskMonthCalendar"));

export const LazyDashboard = lazyNamed(loadDashboard, "Dashboard");
export const LazyLoginScreen = lazyNamed(loadLoginScreen, "LoginScreen");
export const LazySettingsPanel = lazyNamed(loadSettingsPanel, "SettingsPanel");
export const LazyOnboardingWizard = lazyNamed(loadOnboardingWizard, "OnboardingWizard");
export const LazyPaywallModal = lazyNamed(loadPaywallModal, "PaywallModal");
export const LazyTaskMonthCalendar = lazyNamed(loadTaskMonthCalendar, "TaskMonthCalendar");

/** Start the first screen's download in parallel with App (no extra round trip). */
export function prefetchFirstScreen(): void {
  if (typeof window === "undefined") return;
  const signedIn = hasStoredSupabaseSession([window.localStorage, window.sessionStorage]);
  void (signedIn ? loadDashboard() : loadLoginScreen()).catch(() => undefined);
}

/** After the board is up, warm the secondary screens so the first tap on them is instant. */
export function prefetchSecondaryScreens(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const run = () => {
    for (const load of [loadSettingsPanel, loadTaskMonthCalendar, loadPaywallModal, loadOnboardingWizard]) {
      void load().catch(() => undefined);
    }
  };
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(run, { timeout: 4000 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(run, 2500);
  return () => window.clearTimeout(id);
}

function Lazy({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}

export function DashboardScreen(props: ComponentProps<typeof LazyDashboard>) {
  return (
    <Lazy>
      <LazyDashboard {...props} />
    </Lazy>
  );
}

export function LoginScreenLazy(props: ComponentProps<typeof LazyLoginScreen>) {
  return (
    <Lazy>
      <LazyLoginScreen {...props} />
    </Lazy>
  );
}

export function SettingsPanelLazy(props: ComponentProps<typeof LazySettingsPanel>) {
  return (
    <Lazy>
      <LazySettingsPanel {...props} />
    </Lazy>
  );
}

export function OnboardingWizardLazy(props: ComponentProps<typeof LazyOnboardingWizard>) {
  if (!props.enabled) return null;
  return (
    <Lazy>
      <LazyOnboardingWizard {...props} />
    </Lazy>
  );
}

/** Mounted only while open (PaywallModal renders nothing when closed). */
export function PaywallModalLazy(props: ComponentProps<typeof LazyPaywallModal>) {
  if (!props.open) return null;
  return (
    <Lazy>
      <LazyPaywallModal {...props} />
    </Lazy>
  );
}

export function TaskMonthCalendarLazy(props: ComponentProps<typeof LazyTaskMonthCalendar>) {
  return (
    <Lazy fallback={<div className="min-h-[18rem] w-full animate-pulse rounded-xl bg-slate-100/70" aria-busy="true" />}>
      <LazyTaskMonthCalendar {...props} />
    </Lazy>
  );
}
