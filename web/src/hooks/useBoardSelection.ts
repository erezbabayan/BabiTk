import { useCallback, useState } from "react";

import type { BoardSelectScope } from "../lib/board-bulk-actions";

export function useBoardSelection() {
  const [scope, setScope] = useState<BoardSelectScope | null>(null);
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);

  const isSelecting = useCallback(
    (target: BoardSelectScope) => scope === target,
    [scope],
  );

  const enter = useCallback((target: BoardSelectScope) => {
    setScope(target);
    setIds(new Set());
    setBusy(false);
  }, []);

  const exit = useCallback(() => {
    setScope(null);
    setIds(new Set());
    setBusy(false);
  }, []);

  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((itemIds: string[]) => {
    setIds(new Set(itemIds));
  }, []);

  const clear = useCallback(() => {
    setIds(new Set());
  }, []);

  const isSelected = useCallback((id: string) => ids.has(id), [ids]);

  return {
    scope,
    ids,
    busy,
    setBusy,
    isSelecting,
    enter,
    exit,
    toggle,
    selectAll,
    clear,
    isSelected,
    count: ids.size,
  };
}
