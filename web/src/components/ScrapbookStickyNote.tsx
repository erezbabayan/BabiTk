/** Decorative sticky note — bottom-left scrapbook accent. */
export function ScrapbookStickyNote() {
  return (
    <aside
      className="scrapbook-sticky-note pointer-events-none fixed bottom-4 left-3 z-0 hidden max-w-[9.5rem] rotate-[-4deg] rounded-sm border border-amber-200/80 bg-amber-100/95 px-3 py-2 shadow-md lg:block"
      aria-hidden
    >
      <p className="font-hand text-[11px] leading-relaxed text-amber-950/90">
        פשוט לרשום,
        <br />
        כדי לזכור
        <br />
        את כמה שאתה טוב.
        <span className="mt-1 block text-[10px] text-rose-500">♥</span>
      </p>
    </aside>
  );
}
