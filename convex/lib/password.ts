const MIN_PASSWORD_LENGTH = 8;

/** Shared Convex Auth + change-password rule. */
export function assertPasswordRequirements(password: string): void {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error("הסיסמה חייבת להכיל לפחות 8 תווים");
  }
}
