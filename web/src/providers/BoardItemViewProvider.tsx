import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  readBoardItemView,
  toggleBoardItemView,
  writeBoardItemView,
  type BoardItemView,
} from "../lib/board-item-view";

interface BoardItemViewContextValue {
  view: BoardItemView;
  toggleView: () => void;
}

const BoardItemViewContext = createContext<BoardItemViewContextValue | null>(null);

export function BoardItemViewProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<BoardItemView>(() => readBoardItemView());

  const toggleView = useCallback(() => {
    setView((current) => {
      const next = toggleBoardItemView(current);
      writeBoardItemView(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ view, toggleView }), [view, toggleView]);

  return (
    <BoardItemViewContext.Provider value={value}>{children}</BoardItemViewContext.Provider>
  );
}

export function useBoardItemView(): BoardItemViewContextValue {
  const ctx = useContext(BoardItemViewContext);
  if (!ctx) {
    throw new Error("useBoardItemView must be used within BoardItemViewProvider");
  }
  return ctx;
}

/** Safe for panels that may render outside the provider during tests. */
export function useBoardItemViewOptional(): BoardItemViewContextValue {
  const ctx = useContext(BoardItemViewContext);
  return ctx ?? { view: "list", toggleView: () => undefined };
}
