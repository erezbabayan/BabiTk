import { MAX_ITEM_TAGS, type UserTag } from "../lib/tags";
import { TagChip } from "./TagChip";

interface ItemTagSelectProps {
  userTags: UserTag[];
  selected: string[];
  onChange: (next: string[]) => void;
}

export function ItemTagSelect({ userTags, selected, onChange }: ItemTagSelectProps) {
  function toggle(name: string) {
    if (selected.includes(name)) {
      onChange(selected.filter((tag) => tag !== name));
      return;
    }
    if (selected.length >= MAX_ITEM_TAGS) return;
    onChange([...selected, name]);
  }

  if (userTags.length === 0) {
    return <p className="text-[10px] text-slate-400">הגדר תגיות במסך ההגדרות</p>;
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {userTags.map((tag) => (
          <TagChip
            key={tag.id}
            name={tag.name}
            color={tag.color}
            size="sm"
            selected={selected.includes(tag.name)}
            onClick={() => toggle(tag.name)}
          />
        ))}
      </div>
      <p className="text-[9px] text-slate-400">
        {selected.length}/{MAX_ITEM_TAGS} תגיות על הפריט
      </p>
    </div>
  );
}
