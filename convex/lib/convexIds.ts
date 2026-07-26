/** True for Convex-generated document IDs (not legacy UUIDs or demo ids). */
export function isConvexDocumentId(id: string): boolean {
  return /^[a-z0-9]{16,}$/.test(id);
}

export function filterConvexDocumentIds(ids: string[]): string[] {
  return ids.filter(isConvexDocumentId);
}
