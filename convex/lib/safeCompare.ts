/** Constant-time string comparison (length mismatch still compares every byte). */
export function timingSafeEqualString(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i += 1) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

/** True when `candidate` equals any non-empty expected secret (constant time per secret). */
export function matchesAnySecret(candidate: string, secrets: Array<string | null | undefined>): boolean {
  if (!candidate) return false;
  let ok = false;
  for (const secret of secrets) {
    if (secret && timingSafeEqualString(candidate, secret)) ok = true;
  }
  return ok;
}
