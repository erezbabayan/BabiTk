import {
  BABISNAP_COPY,
  babisnapOpenLink,
  readBabisnapPairFragment,
} from "../../../convex/lib/babisnap";
import logo from "../assets/babisnap-logo.webp";

/** Public pair handoff. The token stays in memory and in the address fragment only. */
export function BabiSnapPairPage() {
  const parsed = readBabisnapPairFragment(window.location.hash);
  const href = parsed ? babisnapOpenLink(parsed.token, navigator.userAgent) : null;

  return (
    <main
      dir="rtl"
      className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center"
    >
      <img src={logo} alt="" width={72} height={72} className="h-[72px] w-[72px] rounded-full" />
      <h1 className="mt-4 text-2xl font-bold text-slate-900">BabiSnap</h1>
      {href ? (
        <a
          href={href}
          className="mt-8 block w-full max-w-sm rounded-xl bg-slate-900 px-4 py-4 text-lg font-bold text-white"
        >
          {BABISNAP_COPY.openApp}
        </a>
      ) : (
        <p className="mt-6 text-sm text-slate-600">הקישור לא תקין</p>
      )}
    </main>
  );
}
