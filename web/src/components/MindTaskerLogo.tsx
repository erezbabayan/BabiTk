import { type ReactNode } from "react";

import { BOARD_ACCENT_COLOR } from "../lib/board-accent";
import { tagItemChipBorder, tagItemChipFill, tagItemChipText, tagWheelChipFill, tagWheelChipText } from "../lib/tags";

type LogoSize = "small" | "medium" | "large" | "capture";
type LogoVariant = "full" | "mark";

/** Slate gray — matches המחברת column accent. */
const LOGO_NOTEBOOK_SLATE = BOARD_ACCENT_COLOR.inbox;

interface MindTaskerLogoProps {
  size?: LogoSize;
  variant?: LogoVariant;
  className?: string;
  /** Pulse the three brush bars while ingest / AI is running. */
  thinking?: boolean;
  /** @deprecated Light headers use default dark wordmark; kept for compatibility. */
  wordmarkOnDark?: boolean;
}

const HEIGHT_CLASS = {
  small: "h-7",
  medium: "h-11",
  large: "h-14 sm:h-16",
  capture: "",
} satisfies Record<LogoSize, string>;

const MARK_VIEWBOX = "10 22 132 138";

const MARK_PX: Record<LogoSize, number> = {
  small: 28,
  medium: 36,
  large: 44,
  capture: 28,
};

const WORDMARK_TEXT_CLASS: Record<LogoSize, string> = {
  small: "text-[1.15rem]",
  medium: "text-[1.65rem]",
  large: "text-[2rem] sm:text-[2.35rem]",
  capture: "text-[1.15rem]",
};

const BRUSH_PATH =
  "M14 6C18 6 24 5 28 7C32 9 34 13 34 20C34 38 35 68 33 82C32 88 32 94 29 99C27 104 23 107 18 107C13 107 10 103 7 106C4 109 2 111 0 109C-1 106 0 101 0 96C0 78 1 34 4 18C5 11 7 6 14 6Z";

const TITLE_BRUSH_VIEWBOX = "0 0 100 44";
/** Upright logo brush — same path orientation as the wordmark strokes. */
const VERTICAL_BRUSH_VIEWBOX = "0 0 38 112";

export type BoardMarkTone = "slate" | "blue" | "orange";

const BOARD_MARK_FILL: Record<BoardMarkTone, string> = {
  slate: LOGO_NOTEBOOK_SLATE,
  blue: "#3B82F6",
  orange: "#F97316",
};

type LongBrushLayer = {
  dx: number;
  dy: number;
  scaleX: number;
  scaleY: number;
  opacity?: number;
  ink?: boolean;
};

/** One elongated logo brush — slightly inset so tapered tips stay inside the title clip. */
const TITLE_LONG_BRUSH_LAYERS: LongBrushLayer[] = [
  { dx: 0, dy: 0, scaleX: 4.25, scaleY: 1.08, opacity: 1, ink: true },
  { dx: -0.8, dy: -1.4, scaleX: 4.1, scaleY: 0.76, opacity: 0.3, ink: false },
  { dx: 1, dy: 1.6, scaleX: 4.15, scaleY: 0.72, opacity: 0.24, ink: false },
];

function LongBrushLayerMark({ fill, layer, centerY }: { fill: string; layer: LongBrushLayer; centerY: number }) {
  return (
    <g
      transform={`translate(${50 + layer.dx}, ${centerY + layer.dy})`}
      opacity={layer.opacity ?? 1}
    >
      <g transform={`scale(${layer.scaleX}, ${layer.scaleY})`}>
        <g transform="rotate(-90) translate(-19, -56)">
          <g transform="translate(2, 2)">
            <BrushMarkPaths fill={fill} ink={layer.ink} />
          </g>
        </g>
      </g>
    </g>
  );
}

/** Single long horizontal paintbrush stroke from the logo mark. */
function LongPaintbrushStroke({
  fill,
  layers,
  filterId,
  centerY = 22,
}: {
  fill: string;
  layers: LongBrushLayer[];
  filterId?: string;
  centerY?: number;
}) {
  const content = (
    <g transform={`rotate(-0.6 50 ${centerY})`}>
      {layers.map((layer, index) => (
        <LongBrushLayerMark key={index} fill={fill} layer={layer} centerY={centerY} />
      ))}
    </g>
  );

  if (!filterId) return content;

  return <g filter={`url(#${filterId})`}>{content}</g>;
}

function BrushMarkPaths({ fill, ink = true }: { fill: string; ink?: boolean }) {
  return (
    <>
      <path d={BRUSH_PATH} fill={fill} />
      {ink ? (
        <path
          d={BRUSH_PATH}
          stroke="#1E293B"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ) : null}
    </>
  );
}

function VerticalBrushMark({ fill }: { fill: string }) {
  return (
    <g transform="translate(2, 2)">
      <BrushMarkPaths fill={fill} />
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
    <span dir="ltr" className={`inline-flex h-7 w-2.5 shrink-0 ${className}`} aria-hidden>
      <svg
        viewBox={VERTICAL_BRUSH_VIEWBOX}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="block h-full w-full"
        role="img"
      >
        <VerticalBrushMark fill={BOARD_MARK_FILL[tone]} />
      </svg>
    </span>
  );
}

/** Logo brush stroke as a full-width title underline (option 0 — solid stroke + ink). */
export function BoardBrushUnderline({
  tone,
  className = "",
}: {
  tone: BoardMarkTone;
  className?: string;
}) {
  const fill = BOARD_MARK_FILL[tone];

  return (
    <span
      dir="ltr"
      className={`board-title-brush-underline ${className}`}
      aria-hidden
    >
      <svg
        viewBox={TITLE_BRUSH_VIEWBOX}
        preserveAspectRatio="xMidYMid meet"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="board-title-brush-underline-svg"
        role="img"
      >
        <LongPaintbrushStroke fill={fill} layers={TITLE_LONG_BRUSH_LAYERS} />
      </svg>
    </span>
  );
}

/** Tag label — pastel pill; use variant="item" for softer in-card tags. */
export function TagBrushFrame({
  color,
  textColor: _textColor,
  size = "xs",
  variant = "toolbar",
  selected = true,
  className = "",
  onClick,
  children,
}: {
  color: string;
  textColor?: string;
  size?: "xs" | "sm";
  variant?: "item" | "toolbar";
  selected?: boolean;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const subtle = variant === "item";
  const fill = subtle ? tagItemChipFill(color) : tagWheelChipFill(color);
  const text = subtle ? tagItemChipText(color) : tagWheelChipText(color);
  const border = subtle ? tagItemChipBorder(color) : `${color}66`;
  const sizeClass = size === "sm" ? "tag-chip-pill--sm" : "tag-chip-pill--xs";
  const variantClass = subtle ? "tag-chip-pill--item" : "";
  const stateClass = selected ? "tag-chip-pill--active" : "tag-chip-pill--muted";
  const pillStyle = selected
    ? ({ backgroundColor: fill, borderColor: border, color: text } as const)
    : ({ borderColor: border, color: text } as const);

  const wrapperClass = `tag-chip-pill ${sizeClass} ${variantClass} ${stateClass} ${className}`.trim();

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${wrapperClass} tag-chip-pill-btn`} style={pillStyle}>
        {children}
      </button>
    );
  }

  return (
    <span className={wrapperClass} style={pillStyle}>
      {children}
    </span>
  );
}

function BrushMark({ thinking = false }: { thinking?: boolean }) {
  const pulse = thinking ? "logo-bar-pulse" : "";
  return (
    <g transform="translate(15, 15)" className={thinking ? "logo-thinking" : undefined}>
      <g transform="translate(0, 35)">
        <g className={`${pulse} logo-bar-pulse--1`}>
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
      </g>
      <g transform="translate(44, 20)">
        <g className={`${pulse} logo-bar-pulse--2`}>
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
      </g>
      <g transform="translate(88, 5)">
        <g className={`${pulse} logo-bar-pulse--3`}>
          <path d={BRUSH_PATH} fill={LOGO_NOTEBOOK_SLATE} />
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
    </g>
  );
}

function LogoWordmark({
  size,
  onDark = false,
}: {
  size: LogoSize;
  onDark?: boolean;
}) {
  return (
    <span
      className={`logo-wordmark inline-flex items-baseline leading-none ${WORDMARK_TEXT_CLASS[size]}`}
    >
      <span className={onDark ? "text-slate-400" : "text-slate-800"}>Babi</span>
      <span className="text-orange-500">T</span>
      <span className="text-blue-500">k</span>
    </span>
  );
}

function BrushMarkSvg({
  size,
  thinking,
  className = "",
}: {
  size: LogoSize;
  thinking?: boolean;
  className?: string;
}) {
  const px = MARK_PX[size];
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      width={px}
      height={px}
      className={`block shrink-0 ${className}`}
      role="img"
      aria-hidden
    >
      <BrushMark thinking={thinking} />
    </svg>
  );
}

export function MindTaskerLogo({
  size = "medium",
  variant = "full",
  className = "",
  thinking = false,
  wordmarkOnDark = false,
}: MindTaskerLogoProps) {
  const heightClass = HEIGHT_CLASS[size];
  const label = thinking ? "מעבד קליטה" : "BabiTk";

  if (variant === "mark") {
    return (
      <span
        dir="ltr"
        className={`inline-flex shrink-0 items-center justify-center ${HEIGHT_CLASS[size]} ${className}`}
        aria-label={label}
        aria-busy={thinking || undefined}
      >
        <BrushMarkSvg size={size} thinking={thinking} />
      </span>
    );
  }

  return (
    <span
      dir="ltr"
      className={`inline-flex shrink-0 items-center gap-1.5 sm:gap-2 ${heightClass} ${className}`}
      aria-label={label}
      aria-busy={thinking || undefined}
    >
      <BrushMarkSvg size={size === "large" ? "large" : size === "small" ? "small" : "medium"} thinking={thinking} />
      <LogoWordmark size={size} onDark={wordmarkOnDark} />
    </span>
  );
}
