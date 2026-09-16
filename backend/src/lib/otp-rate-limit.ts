const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS = 5;
const MAX_FAILURES = 8;

const requests = new Map<string, number[]>();
const failures = new Map<string, number[]>();

function prune(stamps: number[], now: number): number[] {
  return stamps.filter((stamp) => now - stamp < WINDOW_MS);
}

function remember(map: Map<string, number[]>, key: string, now: number): number[] {
  const next = prune(map.get(key) ?? [], now);
  next.push(now);
  map.set(key, next);
  return next;
}

export function assertOtpRequestAllowed(key: string): void {
  const now = Date.now();
  const stamps = prune(requests.get(key) ?? [], now);
  if (stamps.length >= MAX_REQUESTS) {
    throw new Error("יותר מדי בקשות קוד. נסו שוב מאוחר יותר.");
  }
  remember(requests, key, now);
}

export function assertOtpVerifyAllowed(key: string): void {
  const now = Date.now();
  const stamps = prune(failures.get(key) ?? [], now);
  if (stamps.length >= MAX_FAILURES) {
    throw new Error("יותר מדי ניסיונות שגויים. בקשו קוד חדש מאוחר יותר.");
  }
}

export function recordOtpVerifyFailure(key: string): void {
  remember(failures, key, Date.now());
}

export function clearOtpVerifyFailures(key: string): void {
  failures.delete(key);
}
