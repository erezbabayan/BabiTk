/**
 * Single tap on an item card opens the editor (the edit button was removed).
 * Selection mode toggles selection instead; a tap that ends a long-press
 * (move / check sheet) must not also open the editor.
 */
export type CardPressAction = "toggle-select" | "edit" | "none";

export function resolveCardPress(input: {
  selecting: boolean;
  longPressFired: boolean;
}): CardPressAction {
  if (input.selecting) return "toggle-select";
  if (input.longPressFired) return "none";
  return "edit";
}
