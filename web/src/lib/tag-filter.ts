import { formatTagLabel } from "./tags.ts";

export const TAG_FILTER_IDLE_LABEL = "סינון תגיות";

/** Compact trigger text so an active tag stays on one line in a narrow board toolbar. */
export function tagFilterTriggerLabel(selected: string | null): string {
  return selected ? formatTagLabel(selected) : TAG_FILTER_IDLE_LABEL;
}

export function tagFilterAriaLabel(selected: string | null): string {
  return selected ? `${TAG_FILTER_IDLE_LABEL}: ${formatTagLabel(selected)}` : TAG_FILTER_IDLE_LABEL;
}
