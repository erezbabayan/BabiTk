import { colorForTag, type UserTag } from "../lib/tags";
import { TagChip } from "./TagChip";

interface ItemTagDotsProps {
  tags: string[];
  userTags?: UserTag[];
  /** Compact colored dots without labels — for dense list rows. */
  dense?: boolean;
  /** One clipped chip row (squares tiles) — keeps labels readable without wrapping height. */
  singleLine?: boolean;
}

export function ItemTagDots({
  tags,
  userTags = [],
  dense = false,
  singleLine = false,
}: ItemTagDotsProps) {
  if (tags.length === 0) return null;

  if (dense) {
    return (
      <div className="flex flex-wrap items-center justify-start gap-1" role="list" aria-label="תגיות">
        {tags.map((tag) => (
          <span
            key={tag}
            role="listitem"
            title={tag}
            aria-label={tag}
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: colorForTag(tag, userTags) }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={
        singleLine
          ? "flex min-w-0 flex-nowrap items-center justify-start gap-0.5 overflow-hidden"
          : "flex flex-wrap items-start justify-start gap-0.5"
      }
      role="list"
      aria-label="תגיות"
    >
      {tags.map((tag) => (
        <TagChip
          key={tag}
          name={tag}
          color={colorForTag(tag, userTags)}
          size="xs"
          variant="item"
          className={singleLine ? "max-w-[4.5rem] truncate" : undefined}
        />
      ))}
    </div>
  );
}
