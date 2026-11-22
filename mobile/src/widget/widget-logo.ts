// BabiTk brush-stroke mark, same path and colors as mobile/assets/icon.svg.
const STROKE =
  "M14 6C18 6 24 5 28 7C32 9 34 13 34 20C34 38 35 68 33 82C32 88 32 94 29 99C27 104 23 107 18 107C13 107 10 103 7 106C4 109 2 111 0 109C-1 106 0 101 0 96C0 78 1 34 4 18C5 11 7 6 14 6Z";

function mark(fills: [string, string, string], outline: string): string {
  const offsets: [number, number][] = [
    [0, 35],
    [44, 20],
    [88, 5],
  ];
  const strokes = offsets
    .map(
      ([x, y], i) =>
        `<g transform="translate(${x},${y})"><path d="${STROKE}" fill="${fills[i]}" stroke="${outline}" stroke-width="7" stroke-linejoin="round"/></g>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 4 134 152">${strokes}</svg>`;
}

export const WIDGET_LOGO_SVG = mark(["#F97316", "#3B82F6", "#94a3b8"], "#1E293B");
/** Muted mark for the empty and signed-out states. */
export const WIDGET_LOGO_GREY_SVG = mark(["#e2e8f0", "#e2e8f0", "#e2e8f0"], "#94a3b8");
