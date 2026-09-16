const HEBREW = /[\u0590-\u05FF]/;

/**
 * Return a client-safe message. Hebrew product errors stay visible;
 * English/internal details stay in server logs.
 */
export function publicErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && HEBREW.test(error.message)) {
    return error.message;
  }
  return fallback;
}
