type LogoSize = "small" | "medium" | "large" | "capture";
type LogoVariant = "full" | "mark";

interface MindTaskerLogoProps {
  size?: LogoSize;
  variant?: LogoVariant;
  className?: string;
}

const HEIGHT_CLASS = {
  small: "h-7",
  medium: "h-11",
  large: "h-14 sm:h-16",
  capture: "",
} satisfies Record<LogoSize, string>;

/** Tight bounds around the three brush marks (default 130×130 viewBox clipped strokes). */
const MARK_VIEWBOX = "10 22 132 138";

const MARK_PX: Record<LogoSize, number> = {
  small: 28,
  medium: 36,
  large: 44,
  capture: 28,
};

const BRUSH_PATH =
  "M14 6C18 6 24 5 28 7C32 9 34 13 34 20C34 38 35 68 33 82C32 88 32 94 29 99C27 104 23 107 18 107C13 107 10 103 7 106C4 109 2 111 0 109C-1 106 0 101 0 96C0 78 1 34 4 18C5 11 7 6 14 6Z";

/** Horizontal brush strip — same stroke, rotated to lie flat. */
const HORIZONTAL_BRUSH_VIEWBOX = "0 0 112 38";

export type BoardMarkTone = "white" | "blue" | "orange";

const BOARD_MARK_FILL: Record<BoardMarkTone, string> = {
  white: "#FFFFFF",
  blue: "#3B82F6",
  orange: "#F97316",
};

/** Center of the upright brush in its local 38×112 box (with translate 2,2). */
const BRUSH_CENTER_X = 19;
const BRUSH_CENTER_Y = 56;

function SingleBrushMark({ fill }: { fill: string }) {
  return (
    <g transform={`translate(56, 19) rotate(-90) translate(-${BRUSH_CENTER_X}, -${BRUSH_CENTER_Y})`}>
      <g transform="translate(2, 2)">
        <path d={BRUSH_PATH} fill={fill} />
        <path
          d={BRUSH_PATH}
          stroke="#1E293B"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
    </g>
  );
}

export function BoardBrushMark({
  tone,
  className = "",
}: {
  tone: BoardMarkTone;
  className?: string;
}) {
  return (
    <span dir="ltr" className={`inline-flex h-[0.75rem] w-[2.25rem] shrink-0 ${className}`} aria-hidden>
      <svg
        viewBox={HORIZONTAL_BRUSH_VIEWBOX}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="block h-full w-full"
        role="img"
      >
        <SingleBrushMark fill={BOARD_MARK_FILL[tone]} />
      </svg>
    </span>
  );
}

function BrushMark() {
  return (
    <g transform="translate(15, 15)">
      <g transform="translate(0, 35)">
        <path d={BRUSH_PATH} fill="#F97316" />
        <path
          d={BRUSH_PATH}
          stroke="#1E293B"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
      <g transform="translate(44, 20)">
        <path d={BRUSH_PATH} fill="#3B82F6" />
        <path
          d={BRUSH_PATH}
          stroke="#1E293B"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
      <g transform="translate(88, 5)">
        <path d={BRUSH_PATH} fill="#FFFFFF" />
        <path
          d={BRUSH_PATH}
          stroke="#1E293B"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
    </g>
  );
}

export function MindTaskerLogo({
  size = "medium",
  variant = "full",
  className = "",
}: MindTaskerLogoProps) {
  const heightClass = HEIGHT_CLASS[size];

  if (variant === "mark") {
    const px = MARK_PX[size];
    return (
      <span
        dir="ltr"
        className={`inline-flex shrink-0 items-center justify-center ${HEIGHT_CLASS[size]} ${className}`}
        aria-label="Mind Tasker"
      >
        <svg
          viewBox={MARK_VIEWBOX}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          width={px}
          height={px}
          className="block"
          role="img"
          aria-hidden="true"
        >
          <BrushMark />
        </svg>
      </span>
    );
  }

  return (
    <span
      dir="ltr"
      className={`inline-flex aspect-[560/160] shrink-0 ${heightClass} ${className}`}
      aria-label="Mind Tasker"
    >
      <svg
        viewBox="0 0 560 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height="100%"
        className="h-full w-full"
        role="img"
        aria-hidden="true"
      >
        <BrushMark />

        <g transform="translate(180, 96)">
          <text
            fontFamily="'Inter', 'Roboto', -apple-system, sans-serif"
            fontSize="54"
            letterSpacing="-1.5"
          >
            <tspan fill="#1E293B" fontWeight="800">
              Mind{" "}
            </tspan>
            <tspan fill="#F97316" fontWeight="500">
              Tasker
            </tspan>
          </text>
        </g>
      </svg>
    </span>
  );
}
