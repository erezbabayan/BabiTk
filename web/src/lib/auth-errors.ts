type AuthMode = "login" | "signup";

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Map Convex Auth server errors to user-friendly Hebrew messages. */
export function formatConvexAuthError(
  error: unknown,
  authMode: AuthMode,
): string {
  const message = errorText(error);

  if (message.includes("Missing environment variable `JWT_PRIVATE_KEY`")) {
    return "שרת ההתחברות לא מוגדר. נסה שוב בעוד דקה או פנה לתמיכה.";
  }

  if (message.includes("InvalidAccountId")) {
    if (authMode === "login") {
      return "לפרופיל שלך במערכת עדיין לא הוגדרה סיסמה. לחץ «הירשם», הזן את אותו אימייל והגדר סיסמה — הנתונים הקיימים יישמרו.";
    }
    return "לא נמצא חשבון. נסה להירשם מחדש.";
  }

  if (
    message.includes("Invalid credentials") ||
    message.includes("InvalidSecret")
  ) {
    return "אימייל או סיסמה שגויים";
  }

  if (message.includes("Invalid password")) {
    return "הסיסמה חייבת להכיל לפחות 8 תווים";
  }

  if (message.includes("Account") && message.includes("already exists")) {
    return "כבר יש חשבון עם האימייל הזה — נסה להתחבר עם אותה סיסמה שהגדרת בהרשמה.";
  }

  if (
    message.includes("free plan limits") ||
    message.includes("deployments have been disabled")
  ) {
    return "שרת Convex חסום (מגבלת Free). יש לשדרג ל־Pro ב־dashboard.convex.dev";
  }

  if (message.includes("יש להזין")) {
    return message;
  }

  return authMode === "login"
    ? "התחברות נכשלה — בדוק אימייל וסיסמה"
    : "הרשמה נכשלה — נסה שוב";
}
