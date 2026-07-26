import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { G, Path } from "react-native-svg";
import { BOARD_ACCENT_COLOR } from "../lib/board-accent";
import { tagItemChipBorder, tagItemChipFill, tagItemChipText, tagWheelChipFill, tagWheelChipText } from "../lib/tags";
import { BOARD_TAB_FONT, LOGO_WORDMARK_FONT } from "../lib/board-font";

type LogoSize = "small" | "medium" | "large" | "capture";
type LogoVariant = "full" | "mark";

/** Slate gray — matches המחברת column accent. */
const LOGO_NOTEBOOK_SLATE = BOARD_ACCENT_COLOR.inbox;

interface MindTaskerLogoProps {
  size?: LogoSize;
  variant?: LogoVariant;
  /** Pulse the three brush bars while ingest / AI is running. */
  thinking?: boolean;
}

const HEIGHT: Record<LogoSize, number> = {
  small: 28,
  medium: 44,
  large: 56,
  capture: 28,
};

const MARK_PX: Record<LogoSize, number> = {
  small: 28,
  medium: 36,
  large: 44,
  capture: 28,
};

/** Match web rem sizes (html root 12px): 1.15 / 1.65 / 2.35 rem. */
const WORDMARK_FONT_SIZE: Record<LogoSize, number> = {
  small: 13.8,
  medium: 19.8,
  large: 28.2,
  capture: 13.8,
};

/** Tight bounds around the three brush marks (default 130×130 viewBox clipped strokes). */
const MARK_VIEWBOX = "10 22 132 138";

const BRUSH_PATH =
  "M14 6C18 6 24 5 28 7C32 9 34 13 34 20C34 38 35 68 33 82C32 88 32 94 29 99C27 104 23 107 18 107C13 107 10 103 7 106C4 109 2 111 0 109C-1 106 0 101 0 96C0 78 1 34 4 18C5 11 7 6 14 6Z";

export type BoardMarkTone = "slate" | "blue" | "orange";

const BOARD_MARK_FILL: Record<BoardMarkTone, string> = {
  slate: LOGO_NOTEBOOK_SLATE,
  blue: "#3B82F6",
  orange: "#F97316",
};

const AnimatedG = Animated.createAnimatedComponent(G);

const TITLE_BRUSH_VIEWBOX = "0 0 100 44";
/** Upright logo brush — same path orientation as the wordmark strokes. */
const VERTICAL_BRUSH_VIEWBOX = "0 0 38 112";

type LongBrushLayer = {
  dx: number;
  dy: number;
  scaleX: number;
  scaleY: number;
  opacity?: number;
  ink?: boolean;
};

const TITLE_LONG_BRUSH_LAYERS: LongBrushLayer[] = [
  { dx: 0, dy: 0, scaleX: 4.25, scaleY: 1.08, opacity: 1, ink: true },
  { dx: -0.8, dy: -1.4, scaleX: 4.1, scaleY: 0.76, opacity: 0.3, ink: false },
  { dx: 1, dy: 1.6, scaleX: 4.15, scaleY: 0.72, opacity: 0.24, ink: false },
];

function BrushMarkPaths({ fill, ink = true }: { fill: string; ink?: boolean }) {
  return (
    <>
      <Path d={BRUSH_PATH} fill={fill} />
      {ink ? (
        <Path
          d={BRUSH_PATH}
          stroke="#1E293B"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ) : null}
    </>
  );
}

function LongBrushLayerMark({
  fill,
  layer,
  centerY,
}: {
  fill: string;
  layer: LongBrushLayer;
  centerY: number;
}) {
  return (
    <G
      transform={`translate(${50 + layer.dx}, ${centerY + layer.dy})`}
      opacity={layer.opacity ?? 1}
    >
      <G transform={`scale(${layer.scaleX}, ${layer.scaleY})`}>
        <G transform="rotate(-90) translate(-19, -56)">
          <G translateX={2} translateY={2}>
            <BrushMarkPaths fill={fill} ink={layer.ink} />
          </G>
        </G>
      </G>
    </G>
  );
}

function LongPaintbrushStroke({
  fill,
  layers,
  centerY = 22,
}: {
  fill: string;
  layers: LongBrushLayer[];
  centerY?: number;
}) {
  return (
    <G transform={`rotate(-0.6 50 ${centerY})`}>
      {layers.map((layer, index) => (
        <LongBrushLayerMark key={index} fill={fill} layer={layer} centerY={centerY} />
      ))}
    </G>
  );
}

function VerticalBrushMark({ fill }: { fill: string }) {
  return (
    <G translateX={2} translateY={2}>
      <BrushMarkPaths fill={fill} />
    </G>
  );
}

export function BoardBrushMark({ tone }: { tone: BoardMarkTone }) {
  const height = 28;
  const width = height * (38 / 112);
  return (
    <Svg
      width={width}
      height={height}
      viewBox={VERTICAL_BRUSH_VIEWBOX}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <VerticalBrushMark fill={BOARD_MARK_FILL[tone]} />
    </Svg>
  );
}

/** Logo brush stroke as a full-width title underline (option 0 — solid stroke + ink). */
export function BoardBrushUnderline({ tone, width = 56 }: { tone: BoardMarkTone; width?: number }) {
  const fill = BOARD_MARK_FILL[tone];
  const stampWidth = Math.max(32, Math.round(width * 0.9));
  const height = Math.max(14, Math.min(22, Math.round(stampWidth * (44 / 100))));

  return (
    <Svg
      width={stampWidth}
      height={height}
      viewBox={TITLE_BRUSH_VIEWBOX}
      preserveAspectRatio="xMidYMid meet"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <LongPaintbrushStroke fill={fill} layers={TITLE_LONG_BRUSH_LAYERS} />
    </Svg>
  );
}

/** Tag label — pastel pill; use variant="item" for softer in-card tags. */
export function TagBrushFrame({
  color,
  size = "xs",
  variant = "toolbar",
  selected = true,
  onPress,
  children,
}: {
  color: string;
  textColor?: string;
  size?: "xs" | "sm";
  variant?: "item" | "toolbar";
  selected?: boolean;
  onPress?: () => void;
  children: ReactNode;
}) {
  const subtle = variant === "item";
  const fill = subtle ? tagItemChipFill(color) : tagWheelChipFill(color);
  const text = subtle ? tagItemChipText(color) : tagWheelChipText(color);
  const border = subtle ? tagItemChipBorder(color) : `${color}66`;
  const pillStyle = [
    frameStyles.pill,
    subtle ? frameStyles.pillItem : null,
    size === "sm" ? frameStyles.pillSm : frameStyles.pillXs,
    selected
      ? { backgroundColor: fill, borderColor: border, opacity: 1 }
      : { backgroundColor: "transparent", borderColor: border, opacity: subtle ? 0.88 : 0.82 },
  ];
  const labelStyle = [
    subtle ? frameStyles.labelItem : size === "sm" ? frameStyles.labelSm : frameStyles.labelXs,
    { color: text },
  ];

  const shell = (
    <View style={pillStyle}>
      {typeof children === "string" ? (
        <Text style={labelStyle}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{shell}</Pressable>;
  }

  return shell;
}

const frameStyles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    flexShrink: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillItem: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  pillXs: {},
  pillSm: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  labelXs: {
    fontFamily: BOARD_TAB_FONT,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 14,
  },
  labelItem: {
    fontFamily: BOARD_TAB_FONT,
    fontSize: 10,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 13,
  },
  labelSm: {
    fontFamily: BOARD_TAB_FONT,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 15,
  },
});

function BrushPaths({ fill }: { fill: string }) {
  return (
    <>
      <Path d={BRUSH_PATH} fill={fill} />
      <Path
        d={BRUSH_PATH}
        stroke="#1E293B"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </>
  );
}

function useThinkingBarAnimation(thinking: boolean) {
  const v1 = useRef(new Animated.Value(0)).current;
  const v2 = useRef(new Animated.Value(0)).current;
  const v3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!thinking) {
      v1.setValue(0);
      v2.setValue(0);
      v3.setValue(0);
      return;
    }

    const loop = (value: Animated.Value, delayMs: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delayMs),
          Animated.timing(value, {
            toValue: 1,
            duration: 440,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 440,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );

    const a1 = loop(v1, 0);
    const a2 = loop(v2, 140);
    const a3 = loop(v3, 280);
    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [thinking, v1, v2, v3]);

  const scale = (value: Animated.Value) =>
    value.interpolate({
      inputRange: [0, 1],
      outputRange: [0.72, 1.06],
    });

  return {
    s1: scale(v1),
    s2: scale(v2),
    s3: scale(v3),
  };
}

function BrushMark({ thinking = false }: { thinking?: boolean }) {
  const { s1, s2, s3 } = useThinkingBarAnimation(thinking);

  return (
    <G translateX={15} translateY={15}>
      <G translateX={0} translateY={35}>
        <AnimatedG transform={[{ scaleY: s1 }]}>
          <BrushPaths fill="#F97316" />
        </AnimatedG>
      </G>
      <G translateX={44} translateY={20}>
        <AnimatedG transform={[{ scaleY: s2 }]}>
          <BrushPaths fill="#3B82F6" />
        </AnimatedG>
      </G>
      <G translateX={88} translateY={5}>
        <AnimatedG transform={[{ scaleY: s3 }]}>
          <BrushPaths fill={LOGO_NOTEBOOK_SLATE} />
        </AnimatedG>
      </G>
    </G>
  );
}

function LogoWordmark({ size }: { size: LogoSize }) {
  const fontSize = WORDMARK_FONT_SIZE[size];
  // Match web `.logo-wordmark` (Solitreo + weight 700). On Android, fontWeight on a
  // single-face custom font often falls back to the system font — skip it there.
  const shared = {
    fontFamily: LOGO_WORDMARK_FONT,
    fontSize,
    lineHeight: fontSize * 1.05,
    letterSpacing: 0,
    includeFontPadding: false as const,
    ...(Platform.OS === "ios" ? { fontWeight: "700" as const } : null),
  };
  return (
    <View style={styles.wordmarkRow} accessibilityElementsHidden>
      <Text style={[shared, styles.wordmarkBabi]}>Babi</Text>
      <Text style={[shared, styles.wordmarkT]}>T</Text>
      <Text style={[shared, styles.wordmarkK]}>k</Text>
    </View>
  );
}

function BrushMarkSvg({ size, thinking }: { size: LogoSize; thinking?: boolean }) {
  const px = MARK_PX[size];
  return (
    <Svg width={px} height={px} viewBox={MARK_VIEWBOX} accessible={false}>
      <BrushMark thinking={thinking} />
    </Svg>
  );
}

export function MindTaskerLogo({
  size = "medium",
  variant = "full",
  thinking = false,
}: MindTaskerLogoProps) {
  const height = HEIGHT[size];
  const label = thinking ? "מעבד קליטה" : "BabiTk";

  if (variant === "mark") {
    return (
      <View
        accessible
        accessibilityLabel={label}
        accessibilityState={{ busy: thinking }}
        style={[styles.markWrap, { height }]}
      >
        <BrushMarkSvg size={size} thinking={thinking} />
      </View>
    );
  }

  const markSize = size === "large" ? "large" : size === "small" ? "small" : "medium";

  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityState={{ busy: thinking }}
      style={[styles.fullWrap, { height }]}
    >
      <BrushMarkSvg size={markSize} thinking={thinking} />
      <LogoWordmark size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  markWrap: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  fullWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  wordmarkRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  wordmarkBabi: {
    color: "#1e293b", // slate-800
  },
  wordmarkT: {
    color: "#f97316", // orange-500
  },
  wordmarkK: {
    color: "#3b82f6", // blue-500
  },
});
