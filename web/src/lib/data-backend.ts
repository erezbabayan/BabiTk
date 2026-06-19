import { isConvexConfigured } from "./convex";

export function useConvexBackend(): boolean {
  if (import.meta.env.VITE_USE_CONVEX === "false") return false;
  return isConvexConfigured;
}