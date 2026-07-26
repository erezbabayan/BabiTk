/**
 * Keep long inbound text readable: headings and one fact per line,
 * without markdown emphasis soup.
 */

/** Collapse spaces/tabs inside lines; keep newlines (and blank lines as paragraph breaks). */
export function preserveInboundLineStructure(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Remove markdown/emphasis markers; keep plain Hebrew headings and lines. */
export function stripMarkdownEmphasis(text: string): string {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/~~([^~\n]+)~~/g, "$1");
}

/**
 * Format body text for storage/display:
 * - preserve existing line breaks
 * - strip markdown bold/headers
 * - if still one long wall of prose, break after sentences / "label:" patterns
 */
export function formatStructuredNoteBody(text: string): string {
  let out = stripMarkdownEmphasis(preserveInboundLineStructure(text));
  if (!out) return out;

  if (!out.includes("\n") && out.length > 90) {
    out = out
      // "כותרת: ערך" → heading line then value
      .replace(/([^\n:]{2,40}):\s+/g, "$1:\n")
      // sentence ends → new line
      .replace(/([.!?׃。])\s+/g, "$1\n")
      // Hebrew list-ish commas between short clauses (sparingly)
      .replace(/\s+[•·]\s+/g, "\n");
  }

  // Normalize "Heading:\nvalue" blocks — blank line before a short heading-like line
  const lines = out.split("\n").map((line) => line.trim()).filter(Boolean);
  const shaped: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const looksLikeHeading =
      /:$/u.test(line) ||
      (line.length <= 32 && i + 1 < lines.length && !/[.!?׃。]$/u.test(line));
    if (looksLikeHeading && shaped.length > 0 && shaped[shaped.length - 1] !== "") {
      shaped.push("");
    }
    shaped.push(line);
  }

  return shaped.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
