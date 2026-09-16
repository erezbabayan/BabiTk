/**
 * Board search is local text filtering. Semantic POST /api/items/search exists
 * only on the retired Express API and must not surface 405 as a notice.
 */

export function isLegacyExpressApiAvailable(apiBaseUrl?: string | null): boolean {
  return Boolean(apiBaseUrl?.trim());
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
