import { formatTagLabel } from "./tags.ts";

/** Visible idle chip — short so it fits the board toolbar. */
export const TAG_FILTER_IDLE_LABEL = "סינון";
/** Accessible name — still names the tag filter when the chip is abbreviated. */
export const TAG_FILTER_ARIA_NAME = "סינון תגיות";

/** Compact trigger text so an active tag stays on one line in a narrow board toolbar. */
export function tagFilterTriggerLabel(selected: string | null): string {
  return selected ? formatTagLabel(selected) : TAG_FILTER_IDLE_LABEL;
}

export function tagFilterAriaLabel(selected: string | null): string {
  return selected ? `${TAG_FILTER_ARIA_NAME}: ${formatTagLabel(selected)}` : TAG_FILTER_ARIA_NAME;
}
