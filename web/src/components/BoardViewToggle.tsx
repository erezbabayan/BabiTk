import { useBoardItemView } from "../providers/BoardItemViewProvider";

/** Sliding switch that toggles board items between list and squares. */
export function BoardViewToggle() {
  const { view, toggleView } = useBoardItemView();
  const isSquares = view === "squares";

  return (
    <button
      type="button"
      onClick={toggleView}
      className="board-view-toggle"
      aria-label="שינוי תצוגה"
      aria-pressed={isSquares}
      title={isSquares ? "תצוגת רשימה" : "תצוגת ריבועים"}
    >
      <span className="board-view-toggle__label">שינוי תצוגה</span>
      <span
        className={`board-view-toggle__track ${
          isSquares ? "board-view-toggle__track--squares" : ""
        }`}
        aria-hidden
      >
        <span className="board-view-toggle__thumb" />
        <span className="board-view-toggle__icon board-view-toggle__icon--list">☰</span>
        <span className="board-view-toggle__icon board-view-toggle__icon--grid">▦</span>
      </span>
    </button>
  );
}
