import { TAG_PALETTE, WHEEL_SLOT_COUNT, normalizeTagName } from "./tags";
import type { UserTag } from "./tags";

export const DIAL_SIZE = 220;
export const RING_RADIUS = 76;
export const CHIP_SIZE = 32;
export const CENTER_SIZE = 28;

export type WheelSlot =
  | { kind: "tag"; id: string; name: string; color: string }
  | { kind: "empty"; id: string; hintColor: string };

export function buildWheelSlots(userTags: UserTag[]): WheelSlot[] {
  const filled: WheelSlot[] = userTags.map((tag) => ({
    kind: "tag" as const,
    id: tag.id,
    name: normalizeTagName(tag.name),
    color: tag.color,
  }));

  const slots: WheelSlot[] = [];
  for (let i = 0; i < WHEEL_SLOT_COUNT; i += 1) {
    const existing = filled[i];
    if (existing) {
      slots.push(existing);
      continue;
    }
    slots.push({
      kind: "empty",
      id: `potential-${i}`,
      hintColor: TAG_PALETTE[i % TAG_PALETTE.length]!,
    });
  }

  return slots;
}

export function slotPosition(index: number, total = WHEEL_SLOT_COUNT) {
  const cx = DIAL_SIZE / 2;
  const cy = DIAL_SIZE / 2;
  const angle = ((index / total) * 360 - 90) * (Math.PI / 180);
  return {
    left: cx + RING_RADIUS * Math.cos(angle) - CHIP_SIZE / 2,
    top: cy + RING_RADIUS * Math.sin(angle) - CHIP_SIZE / 2,
  };
}

export function tickPosition(index: number, total = 12) {
  const cx = DIAL_SIZE / 2;
  const cy = DIAL_SIZE / 2;
  const outer = DIAL_SIZE / 2 - 6;
  const inner = outer - 5;
  const angle = ((index / total) * 360 - 90) * (Math.PI / 180);
  return {
    x1: cx + inner * Math.cos(angle),
    y1: cy + inner * Math.sin(angle),
    x2: cx + outer * Math.cos(angle),
    y2: cy + outer * Math.sin(angle),
  };
}
