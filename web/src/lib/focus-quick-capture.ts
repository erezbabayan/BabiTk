/** Focus the header quick-capture field (used by notebook footer actions). */
export function focusQuickCapture(): void {
  const input = document.querySelector<HTMLInputElement>('input[aria-label="קליטה מהירה"]');
  if (!input) return;
  input.focus();
  input.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
