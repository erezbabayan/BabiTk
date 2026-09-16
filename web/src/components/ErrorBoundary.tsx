import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
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
