import Svg, { G, Path, Text as SvgText, TSpan } from "react-native-svg";

type LogoSize = "small" | "medium" | "large" | "capture";
type LogoVariant = "full" | "mark";

interface MindTaskerLogoProps {
  size?: LogoSize;
  variant?: LogoVariant;
}

const HEIGHT: Record<LogoSize, number> = {
  small: 28,
  medium: 44,
  large: 56,
  capture: 28,
};

/** Tight bounds around the three brush marks (default 130×130 viewBox clipped strokes). */
const MARK_VIEWBOX = "10 22 132 138";

const BRUSH_PATH =
  "M14 6C18 6 24 5 28 7C32 9 34 13 34 20C34 38 35 68 33 82C32 88 32 94 29 99C27 104 23 107 18 107C13 107 10 103 7 106C4 109 2 111 0 109C-1 106 0 101 0 96C0 78 1 34 4 18C5 11 7 6 14 6Z";

const HORIZONTAL_BRUSH_VIEWBOX = "0 0 112 38";

export type BoardMarkTone = "white" | "blue" | "orange";

const BOARD_MARK_FILL: Record<BoardMarkTone, string> = {
  white: "#FFFFFF",
  blue: "#3B82F6",
  orange: "#F97316",
};

const BRUSH_CENTER_X = 19;
const BRUSH_CENTER_Y = 56;

function SingleBrushMark({ fill }: { fill: string }) {
  return (
    <G transform={`translate(56, 19) rotate(-90) translate(-${BRUSH_CENTER_X}, -${BRUSH_CENTER_Y})`}>
      <G translateX={2} translateY={2}>
        <Path d={BRUSH_PATH} fill={fill} />
        <Path
          d={BRUSH_PATH}
          stroke="#1E293B"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </G>
    </G>
  );
}

export function BoardBrushMark({ tone }: { tone: BoardMarkTone }) {
  const width = 36;
  const height = width * (38 / 112);
  return (
    <Svg width={width} height={height} viewBox={HORIZONTAL_BRUSH_VIEWBOX} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SingleBrushMark fill={BOARD_MARK_FILL[tone]} />
    </Svg>
  );
}

function BrushMark() {
  return (
    <G translateX={15} translateY={15}>
      <G translateX={0} translateY={35}>
        <Path d={BRUSH_PATH} fill="#F97316" />
        <Path
          d={BRUSH_PATH}
          stroke="#1E293B"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </G>
      <G translateX={44} translateY={20}>
        <Path d={BRUSH_PATH} fill="#3B82F6" />
        <Path
          d={BRUSH_PATH}
          stroke="#1E293B"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </G>
      <G translateX={88} translateY={5}>
        <Path d={BRUSH_PATH} fill="#FFFFFF" />
        <Path
          d={BRUSH_PATH}
          stroke="#1E293B"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </G>
    </G>
  );
}

export function MindTaskerLogo({ size = "medium", variant = "full" }: MindTaskerLogoProps) {
  const height = HEIGHT[size];

  if (variant === "mark") {
    const px = HEIGHT[size];
    return (
      <Svg
        width={px}
        height={px}
        viewBox={MARK_VIEWBOX}
        accessibilityLabel="Mind Tasker"
      >
        <BrushMark />
      </Svg>
    );
  }

  const width = height * (560 / 160);

  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 560 160"
      accessibilityLabel="Mind Tasker"
    >
      <BrushMark />
      <G translateX={180} translateY={96}>
        <SvgText fontSize={54} letterSpacing={-1.5}>
          <TSpan fill="#1E293B" fontWeight="800">
            Mind{" "}
          </TSpan>
          <TSpan fill="#F97316" fontWeight="500">
            Tasker
          </TSpan>
        </SvgText>
      </G>
    </Svg>
  );
}
