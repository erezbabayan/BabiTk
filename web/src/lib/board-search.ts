/**
 * Board search is local text filtering (filterItemsByQuery / mergeSearchResults).
 * Semantic POST /api/items/search exists only on the retired Express API.
 * GitHub Pages has no that route — POST returns 405 and must not surface as a notice.
 */

export function isLegacyExpressApiAvailable(apiBaseUrl?: string | null): boolean {
  return Boolean(apiBaseUrl?.trim());
}

/**
 * PATCH /api/items/:id/complete exists only on the retired Express API. Without an
 * explicit API base URL (GitHub Pages / Supabase) mark done directly and optimistically.
 */
export function shouldUseLegacyCompleteApi(apiBaseUrl?: string | null): boolean {
  return isLegacyExpressApiAvailable(apiBaseUrl);
}

export function shouldRunRemoteBoardSearch(
  convexBackend: boolean,
  legacyApiAvailable: boolean,
): boolean {
  return !convexBackend && legacyApiAvailable;
}

export function isIgnorableBoardSearchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.trim();
  return (
    /^API error (404|405|501|502|503)$/.test(message) ||
    /^Search failed: (404|405|501|502|503)$/.test(message) ||
    message === "Failed to fetch" ||
    message === "API not available in demo mode" ||
    message === "Not authenticated"
  );
}
