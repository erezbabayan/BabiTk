type AuthMode = "login" | "signup";

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function cleanConvexErrorMessage(message: string): string {
  let cleaned = message
    .replace(/\[Request ID: [^\]]+\]\s*/g, "")
    .replace(/^Server Error\s*/i, "")
    .trim();

  const uncaught = cleaned.match(/Uncaught Error:\s*(.+)$/s);
  if (uncaught?.[1]) {
    cleaned = uncaught[1].trim();
  }

  return cleaned;
}

/** Map Convex Auth server errors to user-friendly Hebrew messages. */
export function formatConvexAuthError(
  error: unknown,
  authMode: AuthMode = "login",
): string {
  const message = cleanConvexErrorMessage(errorText(error));

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
    return "חשבון עם האימייל הזה כבר קיים — נסה להתחבר";
  }

  if (
    message.includes("יש ") ||
    message.includes("מספר טלפון") ||
    message.includes("סיסמה חייבת") ||
    message.includes("לא התקבלו אסימוני")
  ) {
    return message;
  }

  if (message.includes("network") || message.includes("Network")) {
    return "בעיית רשת — בדוק חיבור Wi‑Fi או נתונים סלולריים";
  }

  if (message.length > 0 && message.length < 200) {
    return message;
  }

  return authMode === "login"
    ? "התחברות נכשלה — בדוק אימייל וסיסמה"
    : "הרשמה נכשלה — נסה שוב";
}
