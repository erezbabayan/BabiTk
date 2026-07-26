const STAR_PATH =
  "M12 3.2l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.4l5-.7L12 3.2z";

interface PriorityStarProps {
  active: boolean;
  size?: number;
  className?: string;
}

/** Same solid star shape — only fill color changes (gray ↔ yellow). */
export function PriorityStar({ active, size = 15, className = "" }: PriorityStarProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`block shrink-0 ${className}`.trim()}
      aria-hidden
    >
      <path
        d={STAR_PATH}
        fill={active ? "#fbbf24" : "#cbd5e1"}
        stroke={active ? "#f59e0b" : "#94a3b8"}
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}
