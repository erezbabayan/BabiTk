const CLAIM_MS = 30_000;
const claimedUntil = new Map<string, number>();

/** Remember that this task already owns an on-screen reminder dialog. */
export function claimLocalReminderPopup(itemId: string | null | undefined, now = Date.now()): void {
  if (!itemId) return;
  claimedUntil.set(itemId, now + CLAIM_MS);
}

export function wasLocalReminderItemClaimed(
  itemId: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!itemId) return false;
  const until = claimedUntil.get(itemId);
  if (until === undefined) return false;
  if (now > until) {
    claimedUntil.delete(itemId);
    return false;
  }
  return true;
}

export function resetReminderPopupClaimsForTests(): void {
  claimedUntil.clear();
}
