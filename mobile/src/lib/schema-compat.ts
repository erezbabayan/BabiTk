/** PostgREST / Postgres errors when a column or table is not migrated yet. */
export function isMissingSchemaError(error: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    /does not exist/i.test(message) ||
    /Could not find the (?:table|column)/i.test(message)
  );
}
