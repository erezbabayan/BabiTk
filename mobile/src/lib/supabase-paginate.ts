/** PostgREST caps a single select at `max_rows` (1000 on this project). */
export const SUPABASE_PAGE_SIZE = 500;
const MAX_ROWS = 20_000;

export async function collectPagedRows<T>(
  runPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += SUPABASE_PAGE_SIZE) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await runPage(from, to);
    if (error) {
      throw new Error(error.message);
    }
    const page = data ?? [];
    rows.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) {
      break;
    }
  }
  return rows;
}
