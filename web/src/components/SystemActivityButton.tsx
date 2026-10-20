interface SystemActivityButtonProps {
  pressed?: boolean;
  onClick: () => void;
}

/** Circular-arrow + clock control that opens the system activity board. */
export function SystemActivityButton({ pressed = false, onClick }: SystemActivityButtonProps) {
  return (
    <button
      type="button"
      className="system-activity-btn"
      aria-label="לוח פעילות"
      title="לוח פעילות — מה שנעשה במערכת"
      aria-pressed={pressed}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          d="M19.8 12A7.8 7.8 0 1 0 17.4 17.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <path
          d="M16.6 14.35 20.15 14.1 19.75 11.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="5.05" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M12 9.35v3.05l2.15 1.25"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
