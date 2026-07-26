import { formatUserHeaderName, type UserNameParts } from "../lib/user-display-name";

interface UserHeaderNameProps {
  name: UserNameParts;
  onDark?: boolean;
  variant?: "default" | "notebook";
}

function userInitials(name: UserNameParts): string {
  const first = name.firstName.trim()[0] ?? "";
  const last = name.lastName.trim()[0] ?? "";
  const combined = `${first}${last}`.toUpperCase();
  return combined || "?";
}

/** Profile chip for the header. */
export function UserHeaderName({ name, onDark = false, variant = "default" }: UserHeaderNameProps) {
  const label = formatUserHeaderName(name);
  if (!label) return null;

  const initials = userInitials(name);
  const notebook = variant === "notebook";

  return (
    <div
      dir="auto"
      className="flex max-w-[12rem] shrink-0 items-center gap-2"
      title={label}
    >
      <span
        className={`min-w-0 truncate whitespace-nowrap text-xs font-semibold sm:text-sm ${
          onDark ? "text-slate-200" : "text-stone-700"
        }`}
      >
        {label}
      </span>
      <span
        className={`flex shrink-0 items-center justify-center rounded-full font-bold ${
          notebook || onDark
            ? "h-8 w-8 bg-gradient-to-br from-amber-400 to-orange-500 text-[11px] text-white shadow-sm"
            : "h-7 w-7 bg-slate-200 text-[10px] text-slate-700"
        }`}
        aria-hidden
      >
        {initials}
      </span>
      {notebook || onDark ? (
        <span className="hidden text-[10px] text-stone-400 sm:inline" aria-hidden>
          ▾
        </span>
      ) : null}
    </div>
  );
}
