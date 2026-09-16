/** Convex is retired. The web app uses Supabase only. */
export const isConvexConfigured = false;
export const convex = null;

export function requireConvex(): never {
  throw new Error("Convex הוסר. המערכת עובדת עם Supabase.");
}
