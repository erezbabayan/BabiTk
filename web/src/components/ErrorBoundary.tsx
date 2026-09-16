import { Component, type ErrorInfo, type ReactNode } from "react";

import { isConvexPlanLimitText } from "../lib/convex-health";
import { FREE_BACKEND_OPTIONS } from "../lib/free-backends";
import { enableForcedLocalMode } from "../lib/supabase";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

function isConvexPlanDisabled(message: string): boolean {
  return isConvexPlanLimitText(message);
}

function continueInLocalMode(): void {
  enableForcedLocalMode();
  window.location.reload();
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("BabiTk UI error", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;

      const message = this.state.error.message ?? "";
      if (isConvexPlanDisabled(message)) {
        return (
          <div
            className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-stone-50 px-6 text-center"
            dir="rtl"
          >
            <h1 className="text-xl font-bold text-stone-900">השרת לא זמין כרגע</h1>
            <p className="max-w-md text-sm leading-relaxed text-stone-600">
              שרת Convex חסום בגלל מגבלת תוכנית Free. אפשר להמשיך במצב מקומי חינם
              בלי לשלם — הנתונים נשמרים בדפדפן זה.
            </p>
            <button
              type="button"
              className="rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600"
              onClick={() => continueInLocalMode()}
            >
              המשך במצב מקומי חינם
            </button>
            <p className="max-w-md text-xs leading-relaxed text-stone-500">
              חלופות חינמיות לענן:{" "}
              {FREE_BACKEND_OPTIONS.map((option, index) => (
                <span key={option.url}>
                  {index > 0 ? " · " : null}
                  <a
                    className="font-semibold text-sky-800 underline"
                    href={option.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {option.name}
                  </a>
                </span>
              ))}
            </p>
            <button
              type="button"
              className="text-sm font-semibold text-sky-800 underline"
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
            >
              נסה שוב את הענן
            </button>
          </div>
        );
      }

      return (
        <div className="p-8 text-center" dir="rtl">
          <p className="text-lg font-semibold text-slate-800">משהו השתבש בטעינת הלוח</p>
          <p className="mt-2 text-sm text-slate-500">{message}</p>
          <p className="mt-2 text-xs text-slate-400">
            אם זה חוזר אחרי עדכון — נקו את המטמון של הדפדפן או פתחו בחלון פרטי.
          </p>
          <button
            type="button"
            className="mt-4 rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
            onClick={() => {
              this.setState({ error: null });
              const url = new URL(window.location.href);
              url.searchParams.set("_r", String(Date.now()));
              window.location.replace(url.toString());
            }}
          >
            רענון מלא
          </button>
        </div>
      );
    }

    return <div className="flex min-h-0 flex-1 flex-col">{this.props.children}</div>;
  }
}
