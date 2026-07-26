import Svg, { Circle, Line } from "react-native-svg";

export function ListBoardIcon({ size = 16, color = "#2563eb" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="7" y1="6" x2="22" y2="6" stroke={color} strokeWidth={2.75} strokeLinecap="round" />
      <Line x1="7" y1="12" x2="22" y2="12" stroke={color} strokeWidth={2.75} strokeLinecap="round" />
      <Line x1="7" y1="18" x2="22" y2="18" stroke={color} strokeWidth={2.75} strokeLinecap="round" />
      <Circle cx="4" cy="6" r="1.25" fill={color} />
      <Circle cx="4" cy="12" r="1.25" fill={color} />
      <Circle cx="4" cy="18" r="1.25" fill={color} />
    </Svg>
  );
}
